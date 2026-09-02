import { HIVE_ENGINE_CUSTOM_JSON_ID, TOKEN_ACTIONS, TOKEN_CONTRACT } from "../../engine/constants";
import type { HiveEngineContractAction } from "../../engine/types";
import { actionPayloadBuilder } from "../../protocol/index";
import type { ActionPayload } from "../../protocol/types";
import { HiveSdkError } from "../../types/index";
import { assertAccountName, assertDecimalString } from "../amount";
import { MAX_MEMO_BYTES } from "../hive/HivePaymentBuilder";

export interface EnginePaymentInput<T = Record<string, unknown>> {
  /** Destination account. */
  account: string;
  /** Hive Engine token symbol, e.g. "SWAP.HIVE". */
  symbol: string;
  /** Decimal string quantity. Never a number. */
  quantity: string;
  action: string;
  metadata?: T | null;
}

export interface BuiltEngineTransfer<T = Record<string, unknown>> {
  /** custom_json id of the sidechain. */
  id: string;
  engineAction: HiveEngineContractAction;
  memo: string;
  payload: ActionPayload<T>;
}

/**
 * Builds Hive Engine `tokens.transfer` actions whose contract memo carries the
 * standardized `{ action, metadata }` trigger.
 */
export class EnginePaymentBuilder {
  build<T = Record<string, unknown>>(input: EnginePaymentInput<T>): BuiltEngineTransfer<T> {
    assertAccountName(input?.account, "account");
    if (typeof input?.symbol !== "string" || input.symbol.trim() === "") {
      throw new HiveSdkError("VALIDATION_ERROR", `"symbol" must be a non-empty token symbol`);
    }
    assertDecimalString(input?.quantity, "quantity");

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
      id: HIVE_ENGINE_CUSTOM_JSON_ID,
      engineAction: {
        contractName: TOKEN_CONTRACT,
        contractAction: TOKEN_ACTIONS.transfer,
        contractPayload: {
          symbol: input.symbol,
          to: input.account,
          quantity: input.quantity.trim(),
          memo,
        },
      },
      memo,
      payload,
    };
  }
}

export const enginePaymentBuilder = new EnginePaymentBuilder();
