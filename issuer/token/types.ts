import type { AccountReference } from "../../configs/AccountReference";
import type { IssuerOperationOptions } from "../types";

/** Creating a token costs BEE and the symbol must still be free. */
export interface TokenCreateInput extends IssuerOperationOptions {
  from: AccountReference;
  /** Uppercase letters only, up to 10 characters. */
  symbol: string;
  /** Display name, up to 50 letters, digits and spaces. */
  name: string;
  /** Decimal places, 0 to 8. */
  precision: number;
  /** Positive decimal string. */
  maxSupply: string;
  url?: string;
  /** Skips the BEE balance / existing symbol preflight. Off by default. */
  skipChecks?: boolean;
}

/** `from` is an SDK account reference such as `hive.accounts.treasury`. */
export interface TokenIssueInput extends IssuerOperationOptions {
  from: AccountReference;
  symbol: string;
  /** Destination blockchain account. */
  account: string;
  /** Always a string — never a floating-point number. */
  quantity: string;
  memo?: string;
}

export interface TokenTransferInput extends IssuerOperationOptions {
  from: AccountReference;
  symbol: string;
  account: string;
  quantity: string;
  memo?: string;
}

/**
 * Burn is a transfer to a burn destination.
 * `account` is optional and defaults to the Hive account `"null"`.
 */
export interface TokenBurnInput extends IssuerOperationOptions {
  from: AccountReference;
  symbol: string;
  quantity: string;
  /** Optional burn destination. Defaults to `"null"`. */
  account?: string;
  memo?: string;
}
