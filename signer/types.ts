/**
 * Signer types.
 *
 * The signer receives already-resolved signing credentials and produces a
 * signed transaction. It owns no configuration, no endpoint and no key storage.
 */

/** A Hive transaction as produced by the transaction assembler. */
export interface UnsignedTransaction {
  ref_block_num: number;
  ref_block_prefix: number;
  expiration: string;
  operations: unknown[];
  extensions: unknown[];
  [key: string]: unknown;
}

export interface SignRequest {
  /** Real Hive account name (already resolved from its alias). */
  account: string;
  /** Alias the account was resolved from, for diagnostics. */
  alias?: string;
  /**
   * Resolved signing key. Provided by the account resolver immediately before
   * signing; never stored, logged or serialized by the SDK.
   */
  key?: string;
  /** Transaction to sign. */
  transaction: unknown;
  /** Chain id, when the signing implementation needs one. */
  chainId?: string;
}

export interface SignResult {
  /** The signed transaction, ready to be broadcast. */
  transaction: unknown;
  signatures?: string[];
  raw?: unknown;
}

/**
 * Pluggable signing strategy: local private key, hardware wallet,
 * remote signing service, HSM, ...
 */
export interface TransactionSigner {
  /** Stable identifier used in diagnostics. */
  readonly name: string;
  sign(request: SignRequest, key?: string): Promise<SignResult>;
}
