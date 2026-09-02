import type { CustomJsonParser } from "../../parser/CustomJsonParser";
import { quantitiesEqual } from "../../payments/amount";
import type {
  EngineExecutionExpectation,
  EngineExecutionResult,
  EnginePaymentValidator,
} from "../../payments/engine/EnginePaymentValidator";
import { associateTrigger, type TriggerCandidate } from "../../payments/trigger";
import type { HiveOperation } from "../../rpc/types";
import type { BlockStreamer } from "../../stream/BlockStreamer";
import type { NormalizedBlock } from "../../stream/normalizeBlock";
import { sleep } from "../../utils/helpers";

import { OperationParser } from "./OperationParser";
import { FilterRegistry } from "./FilterRegistry";
import type {
  CustomJsonFilter,
  CustomJsonStreamEvent,
  PaymentFilter,
  PaymentStreamEvent,
  StreamEvent,
  StreamEventPosition,
  StreamHandler,
  StreamSubscription,
  UnifiedStreamOptions,
} from "./types";

export interface StreamEngineDeps {
  blocks: BlockStreamer;
  customJsonParser: CustomJsonParser;
  engineValidator: EnginePaymentValidator;
}

/**
 * The single stream engine.
 *
 * ONE block reader, ONE blockchain connection, many filters:
 *
 *   read blocks -> parse operations -> detect type -> normalize ->
 *   filter -> validate Layer 2 execution when needed -> dispatch
 *
 * Registering a filter never opens another connection, before or after
 * `start()`. Reconnection is handled by the block reader; filters survive it
 * because they live here, not in the reader.
 */
export class StreamEngine {
  private readonly deps: StreamEngineDeps;
  private readonly options: UnifiedStreamOptions;
  private readonly registry = new FilterRegistry();
  private readonly parser: OperationParser;

  private controller: AbortController | null = null;
  private loop: Promise<void> | null = null;
  private pausedGate: Promise<void> | null = null;
  private releaseGate: (() => void) | null = null;

  /** How many block-reading loops this engine has opened. Always 0 or 1. */
  private loopsOpened = 0;
  private lastBlockNumber: number | null = null;

  constructor(deps: StreamEngineDeps, options: UnifiedStreamOptions = {}) {
    this.deps = deps;
    this.options = options;
    this.parser = new OperationParser(deps.customJsonParser);
  }

  /** Register a Custom JSON filter. Returns an unsubscribe handle. */
  customJson<T = Record<string, unknown>>(filter: CustomJsonFilter<T>): StreamSubscription {
    return this.registry.addCustomJson<T>(filter);
  }

  /** Register a payment filter. No `network` field — detection is automatic. */
  payment<T = unknown>(filter: PaymentFilter<T>): StreamSubscription {
    return this.registry.addPayment<T>(filter);
  }

  /** Receive every normalized event, successful and failed alike. */
  onEvent(handler: StreamHandler<StreamEvent>): StreamSubscription {
    return this.registry.addEventHandler(handler);
  }

  get running(): boolean {
    return this.loop !== null;
  }

  get paused(): boolean {
    return this.pausedGate !== null;
  }

  /** Registered subscription count. */
  get filterCount(): number {
    return this.registry.size();
  }

  /** Number of block-reading loops opened by this engine. */
  get connections(): number {
    return this.loopsOpened;
  }

  /** Last block processed by the engine. */
  get blockNumber(): number | null {
    return this.lastBlockNumber;
  }

  /**
   * Start reading blocks. Calling it twice returns the same loop — a second
   * blockchain connection is never opened.
   */
  start(): Promise<void> {
    if (this.loop) return this.loop;

    this.controller = new AbortController();
    const signal = this.options.signal
      ? mergeSignals(this.options.signal, this.controller.signal)
      : this.controller.signal;

    this.loopsOpened += 1;
    this.loop = this.run(signal).finally(() => {
      this.loop = null;
      this.controller = null;
    });
    return this.loop;
  }

  /** Stop the engine. Filters stay registered and `start()` can resume later. */
  stop(): void {
    this.resume();
    this.controller?.abort();
  }

  pause(): void {
    if (this.pausedGate) return;
    this.pausedGate = new Promise<void>((resolve) => {
      this.releaseGate = resolve;
    });
  }

  resume(): void {
    this.releaseGate?.();
    this.releaseGate = null;
    this.pausedGate = null;
  }

  /** Remove every registered filter. */
  clearFilters(): void {
    this.registry.clear();
  }

  private async run(signal: AbortSignal): Promise<void> {
    const fromBlock = this.options.fromBlock;
    const blockOptions = {
      ...(fromBlock !== undefined ? { fromBlock } : {}),
      ...(this.options.pollIntervalMs !== undefined
        ? { pollIntervalMs: this.options.pollIntervalMs }
        : {}),
      ...(this.options.maxRetriesPerBlock !== undefined
        ? { maxRetriesPerBlock: this.options.maxRetriesPerBlock }
        : {}),
      ...(this.options.onError ? { onError: this.options.onError } : {}),
      signal,
    };

    for await (const block of this.deps.blocks.blocks(blockOptions)) {
      if (signal.aborted) break;
      if (this.pausedGate) await this.pausedGate;
      if (signal.aborted) break;
      await this.processBlock(block);
    }
  }

  private async processBlock(block: NormalizedBlock): Promise<void> {
    this.lastBlockNumber = block.blockNumber;
    // Layer 2 execution is read at most once per transaction, per block.
    const executions = new Map<string, EngineExecutionResult>();

    // Deterministic blockchain order: transaction index, then operation index.
    for (const transaction of block.transactions) {
      try {
        await this.processTransaction(block, transaction, executions);
      } catch (error) {
        // A malformed transaction must never kill the stream.
        this.options.onError?.(error, block.blockNumber);
      }
    }
  }

  /**
   * Processing is transaction-scoped: trigger association can only look at
   * operations of the SAME transaction, so the whole transaction is parsed
   * before anything is dispatched.
   */
  private async processTransaction(
    block: NormalizedBlock,
    transaction: NormalizedBlock["transactions"][number],
    executions: Map<string, EngineExecutionResult>,
  ): Promise<void> {
    const customJsonEvents: CustomJsonStreamEvent[] = [];
    const payments: PaymentStreamEvent[] = [];
    const candidates: TriggerCandidate[] = [];

    for (const { operation, operationIndex } of transaction.operations) {
      const position: StreamEventPosition = {
        transactionId: transaction.transactionId,
        blockNumber: block.blockNumber,
        blockTimestamp: block.timestamp,
        transactionIndex: transaction.transactionIndex,
        operationIndex,
      };

      try {
        const customJson = this.parser.customJson(operation, position);
        if (customJson) {
          customJsonEvents.push(customJson);
          if (customJson.standardized && customJson.action) {
            candidates.push({
              operationIndex,
              account: customJson.account,
              payload: { action: customJson.action, metadata: customJson.metadata ?? null },
            });
          }
        }

        const detected = this.parser.payment(operation, position);
        if (detected) {
          payments.push({
            ...detected.payment,
            type: "payment",
            blockNumber: position.blockNumber,
            blockTimestamp: position.blockTimestamp,
            transactionIndex: position.transactionIndex,
            operationIndex: position.operationIndex,
            source: detected.source,
          });
        }
      } catch (error) {
        // One invalid operation is isolated: the rest of the transaction runs.
        this.options.onError?.(error, block.blockNumber);
      }
    }

    for (const event of customJsonEvents) {
      await this.dispatchCustomJson(event);
    }

    for (const event of payments) {
      const associated = associateTrigger(
        {
          operationIndex: event.operationIndex,
          from: event.transfer.from,
          memoTrigger: event.trigger,
        },
        candidates,
      );
      await this.dispatchPayment({ ...event, trigger: associated.trigger }, executions);
    }
  }

  private async dispatchCustomJson(event: CustomJsonStreamEvent): Promise<void> {
    for (const filter of this.registry.customJson()) {
      if (!matchesCustomJson(filter, event)) continue;
      await this.safeCall(filter.handler, event, event.blockNumber);
    }
    await this.emitEvent(event);
  }

  private async dispatchPayment(
    event: PaymentStreamEvent,
    executions: Map<string, EngineExecutionResult>,
  ): Promise<void> {
    const matching = this.registry.payments().filter((filter) => matchesPayment(filter, event));
    const universal = this.registry.events();

    // Nothing can consume this payment: skip the expensive Layer 2 read.
    if (matching.length === 0 && universal.length === 0) return;

    const resolved =
      event.source.type === "layer2"
        ? await this.verifyExecution(event, executions)
        : event;

    for (const filter of matching) {
      if (resolved.success === true) {
        await this.safeCall(filter.handler, resolved, resolved.blockNumber);
      } else if (resolved.success === false && filter.onFailed) {
        await this.safeCall(filter.onFailed, resolved, resolved.blockNumber);
      }
    }

    await this.emitEvent(resolved);
  }

  /** Layer 1 inclusion is not Layer 2 success — the sidechain logs decide. */
  private async verifyExecution(
    event: PaymentStreamEvent,
    executions: Map<string, EngineExecutionResult>,
  ): Promise<PaymentStreamEvent> {
    const execution = await this.readExecution(
      event.transactionId,
      executions,
      event.blockNumber,
      {
        from: event.transfer.from,
        to: event.transfer.account,
        symbol: event.transfer.symbol,
        quantity: event.transfer.quantity,
      },
    );
    if (!execution) return event;
    return {
      ...event,
      success: execution.success,
      status: execution.status,
      ...(execution.error ? { error: execution.error } : {}),
    };
  }

  /**
   * The sidechain indexes a few seconds after the Hive block, so a live stream
   * sees `pending` first. Re-read until the logs resolve, otherwise Layer 2
   * payments would silently never reach `handler` or `onFailed`.
   */
  private async readExecution(
    transactionId: string | null,
    executions: Map<string, EngineExecutionResult>,
    blockNumber: number,
    expected: EngineExecutionExpectation,
  ): Promise<EngineExecutionResult | null> {
    if (!transactionId) return null;
    // Cache per transfer, not per transaction: one transaction can carry
    // several transfers with different verdicts.
    const cacheKey = [
      transactionId,
      expected.from,
      expected.to,
      expected.symbol,
      expected.quantity,
    ].join("|");
    const cached = executions.get(cacheKey);
    if (cached) return cached;

    const attempts = Math.max(1, this.options.engineConfirmationAttempts ?? 6);
    const delayMs = this.options.engineConfirmationDelayMs ?? 2000;
    let last: EngineExecutionResult | null = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (this.controller?.signal.aborted) return last;
      if (attempt > 0 && delayMs > 0) await sleep(delayMs, this.controller?.signal);
      if (this.controller?.signal.aborted) return last;
      try {
        last = await this.deps.engineValidator.verify(transactionId, expected);
      } catch (error) {
        this.options.onError?.(error, blockNumber);
        last = null;
        continue;
      }
      // Only a resolved result is final — pending means "ask again".
      if (last.success !== null) {
        executions.set(cacheKey, last);
        return last;
      }
    }

    return last;
  }

  private async emitEvent(event: StreamEvent): Promise<void> {
    for (const handler of this.registry.events()) {
      await this.safeCall(handler, event, eventBlock(event));
    }
  }

  private async safeCall<E>(
    handler: StreamHandler<E>,
    event: E,
    blockNumber: number,
  ): Promise<void> {
    try {
      await handler(event);
    } catch (error) {
      // A throwing handler must never break the stream or the other handlers.
      this.options.onError?.(error, blockNumber);
    }
  }
}

function eventBlock(event: StreamEvent): number {
  return event.blockNumber ?? 0;
}

function matchesCustomJson(
  filter: CustomJsonFilter<Record<string, unknown>>,
  event: CustomJsonStreamEvent,
): boolean {
  if (filter.id !== undefined && filter.id !== event.id) return false;
  if (filter.standardizedOnly === true && !event.standardized) return false;
  if (filter.actions && filter.actions.length > 0) {
    // actions[] is an OR filter over the standardized payload action.
    if (!event.standardized || !event.action || !filter.actions.includes(event.action)) {
      return false;
    }
  }
  return true;
}

/** Structural match only — execution status is applied by the dispatcher. */
function matchesPayment(filter: PaymentFilter<unknown>, event: PaymentStreamEvent): boolean {
  const { transfer, trigger } = event;
  if (filter.from !== undefined && filter.from !== transfer.from) return false;
  if (filter.account !== undefined && filter.account !== transfer.account) return false;
  if (filter.symbol !== undefined && filter.symbol !== transfer.symbol) return false;
  if (filter.quantity !== undefined && !quantitiesEqual(filter.quantity, transfer.quantity)) {
    return false;
  }
  // actions[] always implies a valid standardized trigger, OR-matched.
  if (filter.actions && filter.actions.length > 0) {
    if (!trigger?.action || !filter.actions.includes(trigger.action)) return false;
  }
  if (filter.requireTrigger === true && trigger === null) return false;
  return true;
}

function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (a.aborted || b.aborted) controller.abort();
  a.addEventListener("abort", abort, { once: true });
  b.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

