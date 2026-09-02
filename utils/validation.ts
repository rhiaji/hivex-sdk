import { HiveSdkError, type CustomJsonPayload } from "../types/index";

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new HiveSdkError("VALIDATION_ERROR", `"${field}" must be a non-empty string`);
  }
}

/**
 * Validates the standardized protocol payload: { action, metadata }.
 * metadata must be present and either null or a plain object.
 */
export function isStandardPayload(value: unknown): value is CustomJsonPayload {
  if (!isPlainObject(value)) return false;
  if (!isNonEmptyString(value["action"])) return false;
  if (!("metadata" in value)) return false;
  const metadata = value["metadata"];
  return metadata === null || isPlainObject(metadata);
}
