import type { StreamEngine } from "../reader/stream/StreamEngine";
import type { PaymentStreamEvent, UnifiedStreamOptions } from "../reader/stream/types";
import { iterateEngine } from "../utils/streamQueue";
import type { ParsedPayment, PaymentStreamOptions } from "./types";

/** Creates a stream engine bound to the caller's options. */
export type StreamEngineFactory = (options: UnifiedStreamOptions) => StreamEngine;

/**
 * Adapter, not an engine.
 *
 * `hive.payments.watch()` is a filtered view of the core block stream. It
 * registers one payment filter on the single stream engine — payments never
 * open their own blockchain polling loop.
 */
export class PaymentWatcher {
  private readonly createEngine: StreamEngineFactory;

  constructor(createEngine: StreamEngineFactory) {
    this.createEngine = createEngine;
  }

  /** Async iterator over normalized payments. */
  watch<T = unknown>(
    options: PaymentStreamOptions<T> = {},
  ): AsyncGenerator<ParsedPayment<T>, void, void> {
    const { filters, onSuccess, onFailed, ...streamOptions } = options;
    const engine = this.createEngine(streamOptions);

    return iterateEngine<ParsedPayment<T>>(
      engine,
      (push) => {
        engine.payment<T>({
          ...(filters?.from !== undefined ? { from: filters.from } : {}),
          ...(filters?.account !== undefined ? { account: filters.account } : {}),
          ...(filters?.symbol !== undefined ? { symbol: filters.symbol } : {}),
          ...(filters?.quantity !== undefined ? { quantity: filters.quantity } : {}),
          ...(filters?.actions && filters.actions.length > 0 ? { actions: filters.actions } : {}),
          ...(filters?.requireTrigger !== undefined
            ? { requireTrigger: filters.requireTrigger }
            : {}),
          handler: async (payment: PaymentStreamEvent<T>) => {
            push(payment);
            await onSuccess?.(payment);
          },
          onFailed: async (payment: PaymentStreamEvent<T>) => {
            push(payment);
            await onFailed?.(payment);
          },
        });
      },
      options.signal,
    );
  }
}
