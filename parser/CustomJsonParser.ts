import { readOperation } from "../operations/detectOperation";
import { actionPayloadParser } from "../protocol/index";
import type { HiveOperation } from "../rpc/types";
import type { CustomJsonEvent, CustomJsonOperationValue } from "../types/index";
import { buildEventId, deriveAccount, safeJsonParse, toStringArray } from "../utils/helpers";

export interface ParseContext {
  blockNumber: number;
  blockTimestamp: string;
  transactionId: string | null;
  transactionIndex: number;
  operationIndex: number;
}

export type ParseResult<T = Record<string, unknown>> =
  | { status: "ok"; event: CustomJsonEvent<T> }
  | { status: "not_custom_json" }
  | { status: "invalid"; reason: string; operation: CustomJsonOperationValue; raw: unknown };

/**
 * THE Custom JSON detector, parser and normalizer. Shared by the block stream
 * engine and the transaction reader. Envelope validation is delegated to the
 * single protocol validator — there is no second `{ action, metadata }` check.
 * Never throws on malformed data.
 */
export class CustomJsonParser {
  /** Detect a custom_json operation in either condenser or api format. */
  extractOperation(operation: HiveOperation): CustomJsonOperationValue | null {
    const detected = readOperation(operation);
    if (!detected || detected.type !== "custom_json") return null;

    const value = detected.value;
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

    const envelope = actionPayloadParser.fromValueResult<T>(parsed.value);
    if (!envelope.valid) {
      return {
        status: "invalid",
        reason: envelope.reason,
        operation: customJson,
        raw: operation,
      };
    }

    const payload = envelope.value;

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
      metadata: payload.metadata,
      requiredAuths: customJson.required_auths,
      requiredPostingAuths: customJson.required_posting_auths,
      raw: operation,
    };

    return { status: "ok", event };
  }
}
