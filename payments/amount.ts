import { HiveSdkError } from "../types/index";

/** Native Hive assets always use three decimals. */
export const NATIVE_PRECISION = 3;

/** Native Hive symbols supported by the payment system. */
export const NATIVE_SYMBOLS = ["HIVE", "HBD"] as const;
export type NativeSymbol = (typeof NATIVE_SYMBOLS)[number];

const DECIMAL_STRING = /^\d+(\.\d+)?$/;

/** Amounts and quantities are always strings — never JavaScript floats. */
export function assertDecimalString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !DECIMAL_STRING.test(value.trim())) {
    throw new HiveSdkError(
      "VALIDATION_ERROR",
      `"${field}" must be a decimal string such as "10.000" — never a number`,
    );
  }
}

export function assertNativeSymbol(value: unknown): asserts value is NativeSymbol {
  if (typeof value !== "string" || !NATIVE_SYMBOLS.includes(value as NativeSymbol)) {
    throw new HiveSdkError("VALIDATION_ERROR", `"symbol" must be "HIVE" or "HBD"`);
  }
}

export function assertAccountName(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HiveSdkError("VALIDATION_ERROR", `"${field}" must be a non-empty account name`);
  }
}

/** `"10" -> "10.000 HIVE"`. String math only; no floating point anywhere. */
export function formatNativeAsset(amount: string, symbol: string): string {
  assertDecimalString(amount, "amount");
  const trimmed = amount.trim();
  const [whole = "0", fraction = ""] = trimmed.split(".");
  if (fraction.length > NATIVE_PRECISION) {
    throw new HiveSdkError(
      "VALIDATION_ERROR",
      `"amount" supports at most ${NATIVE_PRECISION} decimals for native ${symbol}`,
    );
  }
  return `${whole}.${fraction.padEnd(NATIVE_PRECISION, "0")} ${symbol}`;
}

/** Split `"10.000 HIVE"` into its quantity and symbol parts. */
export function parseNativeAsset(
  value: unknown,
): { quantity: string; symbol: string } | null {
  if (typeof value === "string") {
    const [quantity, symbol] = value.trim().split(/\s+/);
    if (!quantity || !symbol || !DECIMAL_STRING.test(quantity)) return null;
    return { quantity, symbol };
  }
  // *_api format: { amount: "10000", precision: 3, nai: "@@000000021" }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const amount = record["amount"];
    const precision = record["precision"];
    const nai = record["nai"];
    if (typeof amount === "string" && typeof precision === "number") {
      const symbol = nai === "@@000000013" ? "HBD" : nai === "@@000000021" ? "HIVE" : null;
      if (!symbol) return null;
      const padded = amount.padStart(precision + 1, "0");
      const whole = padded.slice(0, padded.length - precision);
      const fraction = precision > 0 ? padded.slice(padded.length - precision) : "";
      return { quantity: precision > 0 ? `${whole}.${fraction}` : whole, symbol };
    }
  }
  return null;
}

/**
 * Precision-safe quantity comparison. `"100"`, `"100.0"` and `"100.000"` are
 * the same value; comparison is done on the digits, never with floats.
 */
export function quantitiesEqual(left: string, right: string): boolean {
  const normalize = (value: string): string | null => {
    if (typeof value !== "string" || !DECIMAL_STRING.test(value.trim())) return null;
    const [whole = "0", fraction = ""] = value.trim().split(".");
    const cleanWhole = whole.replace(/^0+(?=\d)/, "");
    const cleanFraction = fraction.replace(/0+$/, "");
    return cleanFraction ? `${cleanWhole}.${cleanFraction}` : cleanWhole;
  };
  const a = normalize(left);
  const b = normalize(right);
  if (a === null || b === null) return false;
  return a === b;
}
