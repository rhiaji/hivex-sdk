import { HiveSdkError } from "../types/index";
import { isNonEmptyString, isPlainObject } from "../utils/validation";
import type { ActionPayload } from "./types";

/**
 * Single source of truth for `{ action, metadata }` validation.
 * Reused by the Custom JSON builder and by every payment trigger.
 */

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

/** Non-throwing guard for parsed, untrusted data. */
export function isActionPayload(value: unknown): value is ActionPayload {
  if (!isPlainObject(value)) return false;
  if (!isNonEmptyString(value["action"])) return false;
  if (!("metadata" in value)) return true;
  const metadata = value["metadata"];
  return metadata === null || metadata === undefined || isPlainObject(metadata);
}

/** Class wrapper kept for symmetry with the rest of the SDK architecture. */
export class ActionPayloadValidator {
  assertAction = assertActionName;
  normalizeMetadata = normalizeActionMetadata;
  isActionPayload = isActionPayload;
}

export const actionPayloadValidator = new ActionPayloadValidator();
