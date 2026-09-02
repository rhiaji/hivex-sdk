import { nftOperationParser } from "../engine/NftOperationParser";
import { operationName, readOperation } from "../operations/detectOperation";
import { enginePaymentParser } from "../payments/engine/EnginePaymentParser";
import { hivePaymentParser } from "../payments/hive/HivePaymentParser";
import { associateTrigger, type TriggerCandidate } from "../payments/trigger";
import type { ParsedPayment } from "../payments/types";
import type { CustomJsonParser } from "../parser/CustomJsonParser";
import type { RpcClient } from "../rpc/RpcClient";
import type { HiveOperation } from "../rpc/types";
import { fetchRawTransaction, type RawHiveTransaction } from "../transaction/fetchTransaction";
import { HiveSdkError, type CustomJsonEvent } from "../types/index";
import type { PaymentSource } from "./stream/types";
import type {
  ReadTransactionInput,
  TransactionOperationResult,
  TransactionResult,
} from "./types";

/**
 * THE canonical transaction reader.
 *
 *   transaction id -> locate -> normalize -> detect operations ->
 *   validate known operations -> normalized result
 *
 * It never opens a block watcher, never polls and never re-implements Custom
 * JSON or payment parsing: it reuses the shared parsers. Layer 2 payments are
 * returned as `pending` — sidechain execution is verified by
 * `hive.payments.validate()`, never assumed from Hive inclusion.
 */
export class TransactionReader {
  private readonly rpc: RpcClient;
  private readonly parser: CustomJsonParser;

  constructor(rpc: RpcClient, parser: CustomJsonParser) {
    this.rpc = rpc;
    this.parser = parser;
  }

  /** Read one transaction and normalize every operation it carries. */
  async read<T = Record<string, unknown>>(
    input: ReadTransactionInput,
  ): Promise<TransactionResult<T>> {
    const transactionId = input?.transactionId?.trim();
    if (!transactionId) {
      throw new HiveSdkError("VALIDATION_ERROR", `"transactionId" must be a non-empty string`);
    }

    const transaction = await fetchRawTransaction(this.rpc, transactionId);
    const blockNumber = numberOrNull(transaction.block_num);
    const transactionIndex = numberOrNull(transaction.transaction_num);
    const blockTimestamp =
      blockNumber !== null ? await this.fetchBlockTimestamp(blockNumber) : null;

    const operations = Array.isArray(transaction.operations) ? transaction.operations : [];
    const parsed: TransactionOperationResult<T>[] = [];
    const triggers: TriggerCandidate<T>[] = [];

    for (let operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
      const operation = operations[operationIndex];
      if (!operation) continue;

      const result = this.parseOperation<T>(operation, {
        transactionId,
        blockNumber,
        blockTimestamp,
        transactionIndex,
        operationIndex,
      });
      parsed.push(result);

      if (result.kind === "custom_json" && result.standardized && result.action) {
        triggers.push({
          operationIndex,
          account: result.account,
          payload: { action: result.action, metadata: result.metadata as never },
        });
      }
    }

    // Trigger association is transaction-aware and runs after every operation
    // of THIS transaction is known — see `payments/trigger.ts` for the rule.
    for (const result of parsed) {
      if (result.kind !== "payment") continue;
      const associated = associateTrigger<T>(
        {
          operationIndex: result.operationIndex,
          from: result.payment.transfer.from,
          memoTrigger: result.payment.trigger as never,
        },
        triggers,
      );
      result.payment = { ...result.payment, trigger: associated.trigger as never };
    }

    return {
      transactionId,
      blockNumber,
      blockTimestamp,
      transactionIndex,
      operations: parsed,
      customJson: this.selectCustomJson<T>(parsed, input),
      payments: this.selectPayments<T>(parsed, input),
      nfts: parsed.flatMap((entry) => (entry.kind === "nft" ? [entry.nft] : [])),
      invalid: parsed.flatMap((entry) =>
        entry.kind === "custom_json" && entry.invalidReason
          ? [{ operationIndex: entry.operationIndex, reason: entry.invalidReason, raw: entry.raw }]
          : [],
      ),
      raw: transaction,
    };
  }

  /**
   * Centralized operation detection. Classification order is deliberate: a
   * Hive Engine token transfer is technically a custom_json, but it is a
   * payment first.
   */
  private parseOperation<T>(
    operation: HiveOperation,
    position: {
      transactionId: string;
      blockNumber: number | null;
      blockTimestamp: string | null;
      transactionIndex: number | null;
      operationIndex: number;
    },
  ): TransactionOperationResult<T> {
    const base = {
      ...position,
      operationType: operationName(operation),
      raw: operation,
    };

    const context = {
      transactionId: position.transactionId,
      ...(position.blockNumber !== null ? { blockNumber: position.blockNumber } : {}),
      operationIndex: position.operationIndex,
    };

    const native = hivePaymentParser.parseOperation<T>(operation, context);
    if (native) return { ...base, kind: "payment", payment: native, source: NATIVE_SOURCE };

    const engine = enginePaymentParser.parseOperation<T>(operation, context);
    if (engine) return { ...base, kind: "payment", payment: engine, source: LAYER2_SOURCE };

    const nft = nftOperationParser.parseOperation(operation);
    if (nft) return { ...base, kind: "nft", nft };

    const customJson = this.parser.extractOperation(operation);
    if (customJson) {
      const result = this.parser.parseOperation<T>(operation, {
        blockNumber: position.blockNumber ?? 0,
        blockTimestamp: position.blockTimestamp ?? "",
        transactionId: position.transactionId,
        transactionIndex: position.transactionIndex ?? 0,
        operationIndex: position.operationIndex,
      });

      if (result.status === "ok") {
        return {
          ...base,
          kind: "custom_json",
          id: customJson.id,
          account: result.event.account,
          standardized: true,
          action: result.event.action,
          metadata: result.event.metadata,
          event: result.event,
          invalidReason: null,
        };
      }

      return {
        ...base,
        kind: "custom_json",
        id: customJson.id,
        account:
          customJson.required_posting_auths[0] ?? customJson.required_auths[0] ?? null,
        standardized: false,
        action: null,
        metadata: null,
        event: null,
        invalidReason: result.status === "invalid" ? result.reason : "Not a standardized payload",
      };
    }

    // Unknown operations are normalized, never thrown and never fatal.
    return { ...base, kind: "unknown" };
  }

  private selectCustomJson<T>(
    operations: TransactionOperationResult<T>[],
    input: ReadTransactionInput,
  ): CustomJsonEvent<T>[] {
    const events: CustomJsonEvent<T>[] = [];
    for (const entry of operations) {
      if (entry.kind !== "custom_json" || !entry.event) continue;
      if (input.id !== undefined && entry.id !== input.id) continue;
      if (input.actions?.length && !input.actions.includes(entry.event.action)) continue;
      events.push(entry.event);
    }
    return events;
  }

  private selectPayments<T>(
    operations: TransactionOperationResult<T>[],
    input: ReadTransactionInput,
  ): ParsedPayment<T>[] {
    const payments: ParsedPayment<T>[] = [];
    for (const entry of operations) {
      if (entry.kind !== "payment") continue;
      const action = entry.payment.trigger?.action;
      if (input.actions?.length && (!action || !input.actions.includes(action))) continue;
      payments.push(entry.payment);
    }
    return payments;
  }

  private async fetchBlockTimestamp(blockNumber: number): Promise<string | null> {
    try {
      const block = await this.rpc.getBlock(blockNumber);
      return typeof block?.timestamp === "string" ? block.timestamp : null;
    } catch {
      return null;
    }
  }
}

const NATIVE_SOURCE: PaymentSource = { type: "native" };
const LAYER2_SOURCE: PaymentSource = { type: "layer2", protocol: "hive-engine" };

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export type { RawHiveTransaction };
