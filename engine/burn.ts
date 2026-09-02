import { HiveSdkError } from "../types/index";

/**
 * Default burn destination.
 *
 * A burn is conceptually a transfer to an account nobody controls. On Hive
 * that account is `null`, so every burn API defaults to it and callers may
 * override it with any other account.
 */
export const DEFAULT_BURN_ACCOUNT = "null";

/**
 * `account = input.account ?? "null"`.
 *
 * When a custom destination is supplied it must be a non-empty string; empty
 * or whitespace-only values are a programming mistake, not a silent default.
 */
export function resolveBurnAccount(account?: string): string {
  if (account === undefined) return DEFAULT_BURN_ACCOUNT;
  if (typeof account !== "string" || account.trim() === "") {
    throw new HiveSdkError(
      "VALIDATION_ERROR",
      `"account" must be a non-empty burn destination when provided (defaults to "${DEFAULT_BURN_ACCOUNT}")`,
    );
  }
  return account.trim();
}
