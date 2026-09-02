import { safeJsonParse } from "../utils/helpers";
import { validateActionPayload } from "./ActionPayloadValidator";
import type { ActionPayload } from "./types";

/**
 * Structured parse outcome. Invalid payloads always explain why — a bare
 * boolean would throw away the only useful debugging information.
 */
export type ActionPayloadParseResult<T = Record<string, unknown>> =
  | { valid: true; value: ActionPayload<T> }
  | { valid: false; reason: string };

/**
 * Reads a standardized payload out of untrusted transport data (a memo or a
 * custom_json body). NEVER throws: malformed input yields an invalid result so
 * a block stream can keep running.
 */
export class ActionPayloadParser {
  /** Parse a raw JSON string, with a failure reason. */
  parseResult<T = Record<string, unknown>>(input: unknown): ActionPayloadParseResult<T> {
    if (typeof input !== "string" || input.trim() === "") {
      return { valid: false, reason: "Payload is empty" };
    }
    const parsed = safeJsonParse(input);
    if (!parsed.ok) return { valid: false, reason: `Malformed JSON: ${parsed.error}` };
    return this.fromValueResult<T>(parsed.value);
  }

  /** Validate an already-parsed value, with a failure reason. */
  fromValueResult<T = Record<string, unknown>>(value: unknown): ActionPayloadParseResult<T> {
    const validation = validateActionPayload(value);
    if (!validation.valid) return validation;
    const record = value as Record<string, unknown>;
    const metadata = record["metadata"];
    return {
      valid: true,
      value: {
        action: record["action"] as string,
        metadata: (metadata === undefined ? null : metadata) as T | null,
      },
    };
  }

  /** Convenience: parse a raw JSON string, null when it is not a payload. */
  parse<T = Record<string, unknown>>(input: unknown): ActionPayload<T> | null {
    const result = this.parseResult<T>(input);
    return result.valid ? result.value : null;
  }

  /** Convenience: normalize an already-parsed value, null when invalid. */
  fromValue<T = Record<string, unknown>>(value: unknown): ActionPayload<T> | null {
    const result = this.fromValueResult<T>(value);
    return result.valid ? result.value : null;
  }
}

export const actionPayloadParser = new ActionPayloadParser();
