import { HIVE_ENGINE_CUSTOM_JSON_ID, TOKEN_ACTIONS, TOKEN_CONTRACT } from "../../engine/constants";
import { readOperation } from "../../operations/detectOperation";
import { safeJsonParse } from "../../utils/helpers";
import { isPlainObject } from "../../utils/validation";
import { triggerFromMemo } from "../trigger";
import type { ParsedPayment } from "../types";

export interface EngineOperationContext {
  transactionId?: string | null;
  blockNumber?: number;
  operationIndex?: number;
}

/**
 * THE Hive Engine token transfer normalizer.
 * Never throws — anything that is not a sidechain token transfer is null.
 *
 * The parser can only report `success: null` (pending): Layer 1 inclusion says
 * nothing about Layer 2 execution. `EnginePaymentValidator` resolves that.
 */
export class EnginePaymentParser {
  parseOperation<T = unknown>(
    operation: unknown,
    context: EngineOperationContext = {},
  ): ParsedPayment<T> | null {
    const detected = readOperation(operation);
    if (!detected || detected.type !== "custom_json") return null;

    const value = detected.value;
    if (value["id"] !== HIVE_ENGINE_CUSTOM_JSON_ID) return null;

    const sender = this.resolveSender(value);
    if (!sender) return null;

    const parsed = safeJsonParse(typeof value["json"] === "string" ? value["json"] : "");
    if (!parsed.ok) return null;

    const actions = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
    for (const engineAction of actions) {
      const transfer = this.readTransfer(engineAction);
      if (!transfer) continue;

      return {
        network: "engine",
        transactionId: context.transactionId ?? null,
        ...(context.blockNumber !== undefined ? { blockNumber: context.blockNumber } : {}),
        ...(context.operationIndex !== undefined
          ? { operationIndex: context.operationIndex }
          : {}),
        // Layer 2 execution is unknown until the sidechain logs are read.
        success: null,
        status: "pending",
        transfer: {
          from: sender,
          account: transfer.to,
          symbol: transfer.symbol,
          quantity: transfer.quantity,
          memo: transfer.memo,
        },
        trigger: triggerFromMemo<T>(transfer.memo),
        raw: operation,
      };
    }

    return null;
  }

  private readTransfer(
    value: unknown,
  ): { to: string; symbol: string; quantity: string; memo: string | null } | null {
    if (!isPlainObject(value)) return null;
    if (value["contractName"] !== TOKEN_CONTRACT) return null;
    if (value["contractAction"] !== TOKEN_ACTIONS.transfer) return null;
    const payload = value["contractPayload"];
    if (!isPlainObject(payload)) return null;

    const to = payload["to"];
    const symbol = payload["symbol"];
    const quantity = payload["quantity"];
    if (typeof to !== "string" || typeof symbol !== "string") return null;
    if (typeof quantity !== "string" && typeof quantity !== "number") return null;

    return {
      to,
      symbol,
      // Quantity stays a decimal string — never a JavaScript float.
      quantity: String(quantity),
      memo: typeof payload["memo"] === "string" ? payload["memo"] : null,
    };
  }

  private resolveSender(value: Record<string, unknown>): string | null {
    const active = value["required_auths"];
    if (Array.isArray(active) && typeof active[0] === "string") return active[0];
    const posting = value["required_posting_auths"];
    if (Array.isArray(posting) && typeof posting[0] === "string") return posting[0];
    return null;
  }
}

export const enginePaymentParser = new EnginePaymentParser();
