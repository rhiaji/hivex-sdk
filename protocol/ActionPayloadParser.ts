import { safeJsonParse } from "../utils/helpers";
import { isActionPayload } from "./ActionPayloadValidator";
import type { ActionPayload } from "./types";

/**
 * Reads a standardized payload out of untrusted transport data (a memo or a
 * custom_json body). NEVER throws: malformed input yields `null` so a block
 * stream can keep running.
 */
export class ActionPayloadParser {
  /** Parse a raw JSON string. Returns null when it is not a valid payload. */
  parse<T = Record<string, unknown>>(input: unknown): ActionPayload<T> | null {
    if (typeof input !== "string" || input.trim() === "") return null;
    const parsed = safeJsonParse(input);
    if (!parsed.ok) return null;
    return this.fromValue<T>(parsed.value);
  }

  /** Normalize an already-parsed value. Returns null when it is not a payload. */
  fromValue<T = Record<string, unknown>>(value: unknown): ActionPayload<T> | null {
    if (!isActionPayload(value)) return null;
    const record = value as unknown as Record<string, unknown>;
    const metadata = record["metadata"];
    return {
      action: record["action"] as string,
      metadata: (metadata === undefined ? null : metadata) as T | null,
    };
  }
}

export const actionPayloadParser = new ActionPayloadParser();
