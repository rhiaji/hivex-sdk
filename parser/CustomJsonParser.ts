import type { ApiOperation, HiveOperation } from "../rpc/types";
import type { CustomJsonEvent, CustomJsonOperationValue } from "../types/index";
import { buildEventId, deriveAccount, safeJsonParse, toStringArray } from "../utils/helpers";
import { isPlainObject, isStandardPayload } from "../utils/validation";

export interface ParseContext {
  blockNumber: number;
  blockTimestamp: string;
  transactionId: string;
  transactionIndex: number;
  operationIndex: number;
}

export type ParseResult<T = Record<string, unknown>> =
  | { status: "ok"; event: CustomJsonEvent<T> }
  | { status: "not_custom_json" }
  | { status: "invalid"; reason: string; operation: CustomJsonOperationValue; raw: unknown };

/**
 * Single source of truth for detecting, parsing, validating and normalizing
 * Hive custom_json operations. Shared by the block streamer and the
 * transaction reader. Never throws on malformed data.
 */
export class CustomJsonParser {
  /** Detect a custom_json operation in either condenser or api format. */
  extractOperation(operation: HiveOperation): CustomJsonOperationValue | null {
    let value: unknown = null;

    if (Array.isArray(operation)) {
      if (operation[0] !== "custom_json") return null;
      value = operation[1];
    } else if (isPlainObject(operation)) {
      const type = (operation as ApiOperation).type;
      if (type !== "custom_json" && type !== "custom_json_operation") return null;
      value = (operation as ApiOperation).value;
    }

    if (!isPlainObject(value)) return null;
    if (typeof value["id"] !== "string" || typeof value["json"] !== "string") return null;

    return {
      required_auths: toStringArray(value["required_auths"]),
      required_posting_auths: toStringArray(value["required_posting_auths"]),
      id: value["id"],
      json: value["json"],
    };
  }

  /** Parse one operation into a normalized event. */
  parseOperation<T = Record<string, unknown>>(
    operation: HiveOperation,
    context: ParseContext,
    filter?: { id?: string; actions?: string[] },
  ): ParseResult<T> {
    const customJson = this.extractOperation(operation);
    if (!customJson) return { status: "not_custom_json" };

    if (filter?.id !== undefined && customJson.id !== filter.id) {
      return { status: "not_custom_json" };
    }

    const parsed = safeJsonParse(customJson.json);
    if (!parsed.ok) {
      return {
        status: "invalid",
        reason: `Malformed JSON: ${parsed.error}`,
        operation: customJson,
        raw: operation,
      };
    }

    if (!isStandardPayload(parsed.value)) {
      return {
        status: "invalid",
        reason: "Payload does not follow the { action, metadata } protocol",
        operation: customJson,
        raw: operation,
      };
    }

    const payload = parsed.value;

    if (filter?.actions && filter.actions.length > 0 && !filter.actions.includes(payload.action)) {
      return { status: "not_custom_json" };
    }

    const event: CustomJsonEvent<T> = {
      eventId: buildEventId(
        context.blockNumber,
        context.transactionIndex,
        context.operationIndex,
      ),
      transactionId: context.transactionId,
      blockNumber: context.blockNumber,
      blockTimestamp: context.blockTimestamp,
      transactionIndex: context.transactionIndex,
      operationIndex: context.operationIndex,
      account: deriveAccount(customJson.required_auths, customJson.required_posting_auths),
      id: customJson.id,
      action: payload.action,
      metadata: (payload.metadata ?? null) as T | null,
      requiredAuths: customJson.required_auths,
      requiredPostingAuths: customJson.required_posting_auths,
      raw: operation,
    };

    return { status: "ok", event };
  }
}
