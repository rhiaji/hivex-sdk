import { actionPayloadBuilder } from "../../protocol/index";
import type { ActionPayload } from "../../protocol/types";
import { HiveSdkError } from "../../types/index";
import { assertAccountName, assertNativeSymbol, formatNativeAsset } from "../amount";

/** Hive memos are limited; keep triggers small and explicit. */
export const MAX_MEMO_BYTES = 2048;

export interface HivePaymentInput<T = Record<string, unknown>> {
  /** Destination account. */
  account: string;
  /** Decimal string, e.g. "10.000". Never a number. */
  amount: string;
  /** "HIVE" or "HBD". */
  symbol: string;
  /** Standardized trigger action. */
  action: string;
  metadata?: T | null;
}

export interface BuiltHiveTransfer<T = Record<string, unknown>> {
  account: string;
  amount: string;
  symbol: string;
  /** Serialized `{ action, metadata }` payload placed in the memo. */
  memo: string;
  payload: ActionPayload<T>;
}

/**
 * Builds native HIVE / HBD transfer operations whose memo carries the exact
 * same standardized `{ action, metadata }` payload used by custom_json.
 */
export class HivePaymentBuilder {
  build<T = Record<string, unknown>>(input: HivePaymentInput<T>): BuiltHiveTransfer<T> {
    assertAccountName(input?.account, "account");
    assertNativeSymbol(input?.symbol);
    const amount = formatNativeAsset(input.amount, input.symbol);
    const payload = actionPayloadBuilder.build<T>({
      action: input.action,
      metadata: input.metadata ?? null,
    });
    const memo = actionPayloadBuilder.serialize(payload);

    const size = new TextEncoder().encode(memo).length;
    if (size > MAX_MEMO_BYTES) {
      throw new HiveSdkError(
        "VALIDATION_ERROR",
        `The trigger memo is ${size} bytes, above the ${MAX_MEMO_BYTES} byte limit. Reduce the metadata size.`,
      );
    }

    return {
      account: input.account,
      amount,
      symbol: input.symbol,
      memo,
      payload,
    };
  }

  /** Full `["transfer", { ... }]` operation tuple. */
  buildOperation<T = Record<string, unknown>>(
    from: string,
    input: HivePaymentInput<T>,
  ): unknown[] {
    assertAccountName(from, "from");
    const built = this.build<T>(input);
    return [
      "transfer",
      {
        from,
        to: built.account,
        amount: built.amount,
        memo: built.memo,
      },
    ];
  }
}

export const hivePaymentBuilder = new HivePaymentBuilder();
