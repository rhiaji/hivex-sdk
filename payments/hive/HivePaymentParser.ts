import { readOperation } from "../../operations/detectOperation";
import { parseNativeAsset } from "../amount";
import { triggerFromMemo } from "../trigger";
import type { ParsedPayment } from "../types";

export interface HiveOperationContext {
  transactionId?: string | null;
  blockNumber?: number;
  operationIndex?: number;
}

/**
 * THE native HIVE / HBD transfer normalizer.
 * Never throws — unrecognized operations simply return null.
 */
export class HivePaymentParser {
  /** Parse a `["transfer", {...}]` tuple or `{ type, value }` object. */
  parseOperation<T = unknown>(
    operation: unknown,
    context: HiveOperationContext = {},
  ): ParsedPayment<T> | null {
    const detected = readOperation(operation);
    if (!detected || detected.type !== "transfer") return null;

    const value = detected.value;
    const from = value["from"];
    const to = value["to"];
    const asset = parseNativeAsset(value["amount"]);
    if (typeof from !== "string" || typeof to !== "string" || !asset) return null;

    const memo = typeof value["memo"] === "string" ? value["memo"] : null;

    return {
      network: "hive",
      transactionId: context.transactionId ?? null,
      ...(context.blockNumber !== undefined ? { blockNumber: context.blockNumber } : {}),
      ...(context.operationIndex !== undefined
        ? { operationIndex: context.operationIndex }
        : {}),
      // A native transfer included in a block has executed by definition.
      success: true,
      status: "success",
      transfer: {
        from,
        account: to,
        symbol: asset.symbol,
        // Quantity stays a decimal string — never a JavaScript float.
        quantity: asset.quantity,
        memo,
      },
      trigger: triggerFromMemo<T>(memo),
      raw: operation,
    };
  }
}

export const hivePaymentParser = new HivePaymentParser();
