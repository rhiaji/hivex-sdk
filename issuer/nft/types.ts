import type { AccountReference } from "../../configs/AccountReference";
import type { IssuerOperationOptions } from "../types";

/** Hive Engine account types for NFT operations. */
export type NftAccountType = "user" | "contract";

/** Optional locked assets attached at issuance. */
export interface NftLockNfts {
  symbol: string;
  ids: string[];
}

/** Creating an NFT costs BEE and the symbol must still be free. */
export interface NftCreateInput extends IssuerOperationOptions {
  from: AccountReference;
  /** Display name, up to 50 letters, digits and spaces. */
  name: string;
  /** Uppercase letters only, up to 10 characters. */
  symbol: string;
  /** Company / organization. Optional. */
  orgName?: string;
  /** Product name. Optional. */
  productName?: string;
  /** Positive decimal string. Unlimited when omitted. */
  maxSupply?: string;
  /** Project website. Optional. */
  website?: string;
  authorizedIssuingAccounts?: string[];
  authorizedIssuingContracts?: string[];
  /** Skips the BEE balance / existing symbol preflight. Off by default. */
  skipChecks?: boolean;
}

/** `from` is an SDK account reference such as `game.accounts.minter`. */
export interface NftIssueInput<
  TProperties extends Record<string, unknown> = Record<string, unknown>,
> extends IssuerOperationOptions {
  from: AccountReference;
  symbol: string;
  /** Destination account (or contract when `accountType` is "contract"). */
  account: string;
  feeSymbol: string;
  accountType?: NftAccountType;
  fromType?: NftAccountType;
  properties?: TProperties;
  lockTokens?: Record<string, string>;
  lockNfts?: NftLockNfts[];
}

/** One instance inside an `issueMultiple` operation. */
export interface NftIssueInstance<
  TProperties extends Record<string, unknown> = Record<string, unknown>,
> {
  symbol: string;
  account: string;
  feeSymbol: string;
  accountType?: NftAccountType;
  fromType?: NftAccountType;
  properties?: TProperties;
  lockTokens?: Record<string, string>;
  lockNfts?: NftLockNfts[];
}

export interface NftIssueMultipleInput<
  TProperties extends Record<string, unknown> = Record<string, unknown>,
> extends IssuerOperationOptions {
  from: AccountReference;
  instances: Array<NftIssueInstance<TProperties>>;
}

export interface NftTransferItem {
  symbol: string;
  ids: string[];
}

export interface NftTransferInput extends IssuerOperationOptions {
  from: AccountReference;
  account: string;
  accountType?: NftAccountType;
  fromType?: NftAccountType;
  nfts: NftTransferItem[];
}

/**
 * Burn is an NFT transfer to a burn destination.
 * `account` is optional and defaults to the Hive account `"null"`.
 */
export interface NftBurnInput extends Omit<IssuerOperationOptions, "id"> {
  from: AccountReference;
  symbol: string;
  /** One NFT id, or several ids of the same symbol. */
  id: string | string[];
  /** Optional burn destination. Defaults to `"null"`. */
  account?: string;
  accountType?: NftAccountType;
  fromType?: NftAccountType;
}

/** Consistent result of every NFT issuer operation. */
export interface NftTransactionResult {
  success: boolean;
  transactionId?: string;
  action: string;
  account?: string;
  raw: unknown;
}
