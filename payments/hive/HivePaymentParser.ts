import { actionPayloadParser } from "../../protocol/index";
import { isPlainObject } from "../../utils/validation";
import { parseNativeAsset } from "../amount";
import type { ParsedPayment } from "../types";

export interface HiveOperationContext {
  transactionId?: string | null;
  blockNumber?: number;
  operationIndex?: number;
}

/**
 * Reads native HIVE / HBD transfers out of raw block data.
 * Never throws — unrecognized operations simply return null.
 */
export class HivePaymentParser {
  /** Parse a `["transfer", {...}]` tuple or `{ type, value }` object. */
  parseOperation<T = unknown>(
    operation: unknown,
    context: HiveOperationContext = {},
  ): ParsedPayment<T> | null {
    const normalized = this.normalizeOperation(operation);
    if (!normalized || normalized.type !== "transfer") return null;

    const value = normalized.value;
    const from = value["from"];
    const to = value["to"];
    const asset = parseNativeAsset(value["amount"]);
    if (typeof from !== "string" || typeof to !== "string" || !asset) return null;

    const memo = typeof value["memo"] === "string" ? value["memo"] : null;
    const trigger = actionPayloadParser.parse<T>(memo);

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
        quantity: asset.quantity,
        memo,
      },
      trigger,
      raw: operation,
    };
  }

  private normalizeOperation(
    operation: unknown,
  ): { type: string; value: Record<string, unknown> } | null {
    if (Array.isArray(operation) && typeof operation[0] === "string") {
      const value = operation[1];
      return isPlainObject(value) ? { type: operation[0], value } : null;
    }
    if (isPlainObject(operation)) {
      const type = operation["type"];
      const value = operation["value"];
      if (typeof type === "string" && isPlainObject(value)) {
        return { type: type.replace(/_operation$/, ""), value };
      }
    }
    return null;
  }
}

export const hivePaymentParser = new HivePaymentParser();
