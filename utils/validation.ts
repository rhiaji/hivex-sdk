import { HiveSdkError } from "../types/index";

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
 * The three shared write-side validators. Token and NFT operations, backend and
 * Keychain alike, all validate through these — there is no per-method validator.
 */

/** Blockchain account name. Never an alias, never a role string. */
export function assertAccountName(value: unknown, field = "account"): asserts value is string {
  assertNonEmptyString(value, field);
}

export function assertTokenSymbol(value: unknown, field = "symbol"): asserts value is string {
  if (typeof value !== "string" || !/^[A-Z0-9.]{1,32}$/.test(value.trim())) {
    throw new HiveSdkError("VALIDATION_ERROR", `"${field}" must be an uppercase token symbol`);
  }
}

/**
 * Quantities are decimal strings — never JavaScript floats, which cannot
 * represent blockchain amounts exactly. Zero and negative values are rejected.
 */
export function assertTokenQuantity(value: unknown, field = "quantity"): asserts value is string {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value.trim())) {
    throw new HiveSdkError(
      "VALIDATION_ERROR",
      `"${field}" must be a positive decimal string such as "100" or "100.000"`,
    );
  }
  if (Number(value) <= 0) {
    throw new HiveSdkError("VALIDATION_ERROR", `"${field}" must be greater than zero`);
  }
}

/**
 * Standardized `{ action, metadata }` validation lives in
 * `protocol/ActionPayloadValidator` — there is exactly one envelope validator.
 */
