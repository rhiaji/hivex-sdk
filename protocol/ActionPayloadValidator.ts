import { HiveSdkError } from "../types/index";
import { isNonEmptyString, isPlainObject } from "../utils/validation";
import type { ActionPayload } from "./types";

/**
 * THE single source of truth for `{ action, metadata }` validation.
 *
 * Reused by the Custom JSON builder, the Custom JSON parser, the transaction
 * reader, every payment trigger and every stream filter. There is no second
 * envelope validator in the SDK.
 */

/** Structured validation outcome. Invalid payloads always carry a reason. */
export type ActionPayloadValidation =
  | { valid: true }
  | { valid: false; reason: string };

/** `action` must be a non-empty, non-whitespace string. */
export function assertActionName(value: unknown): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new HiveSdkError("VALIDATION_ERROR", `"action" must be a non-empty string`);
  }
}

/**
 * `metadata` may be omitted, null or a plain object. Anything else is a hard
 * error — malformed metadata is never silently converted.
 */
export function normalizeActionMetadata<T>(value: unknown): T | null {
  const metadata = value === undefined ? null : value;
  if (metadata !== null && !isPlainObject(metadata)) {
    throw new HiveSdkError("VALIDATION_ERROR", `"metadata" must be an object or null`);
  }
  return metadata as T | null;
}

/**
 * Non-throwing validation of untrusted, already-parsed data.
 * Returns a human-readable reason instead of a bare boolean.
 */
export function validateActionPayload(value: unknown): ActionPayloadValidation {
  if (!isPlainObject(value)) {
    return { valid: false, reason: "Payload must be a JSON object" };
  }
  if (!("action" in value)) {
    return { valid: false, reason: `Payload is missing the required "action" field` };
  }
  if (!isNonEmptyString(value["action"])) {
    return { valid: false, reason: `"action" must be a non-empty string` };
  }
  if (!("metadata" in value)) return { valid: true };
  const metadata = value["metadata"];
  if (metadata === null || metadata === undefined || isPlainObject(metadata)) {
    return { valid: true };
  }
  return { valid: false, reason: `"metadata" must be an object or null` };
}

/** Boolean guard built on {@link validateActionPayload}. */
export function isActionPayload(value: unknown): value is ActionPayload {
  return validateActionPayload(value).valid;
}

/** Class wrapper kept for symmetry with the rest of the SDK architecture. */
export class ActionPayloadValidator {
  assertAction = assertActionName;
  normalizeMetadata = normalizeActionMetadata;
  validate = validateActionPayload;
  isActionPayload = isActionPayload;
}

export const actionPayloadValidator = new ActionPayloadValidator();
