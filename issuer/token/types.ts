import type { AccountReference } from "../../configs/AccountReference";
import type { IssuerOperationOptions } from "../types";

/** `from` is an SDK account reference such as `hive.accounts.treasury`. */
export interface TokenMintInput extends IssuerOperationOptions {
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
