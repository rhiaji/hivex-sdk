/**
 * Configuration system types.
 *
 * A configuration is a named set of account aliases plus optional
 * application metadata. Configurations DO NOT control RPC nodes: RPC endpoint
 * discovery is a separate system (Beacon + default nodes + fallback).
 *
 * Configurations never contain resolved private keys. They may reference an
 * environment variable name (`keyEnv`) which is resolved lazily, only when a
 * backend signing operation actually needs it.
 */

/**
 * A single account alias entry.
 *
 * Exactly one of `account` / `accountEnv` is required.
 * At most one of `key` / `keyEnv` may be provided (both may be omitted —
 * frontend Hive Keychain flows need no private key at all).
 */
export interface HiveAccountConfig {
  /** Direct Hive account name. */
  account?: string;
  /** Name of the environment variable holding the Hive account name. */
  accountEnv?: string;
  /** Direct private key. Backend environments only — never in frontend code. */
  key?: string;
  /** Name of the environment variable holding the private key (backend only). */
  keyEnv?: string;
  /** Arbitrary developer-defined options for this account. */
  options?: Record<string, unknown>;
}

/** A named configuration. */
export interface HiveConfig {
  /** Developer-defined account aliases. Keys are arbitrary. */
  accounts?: Record<string, HiveAccountConfig>;
  /** Optional application metadata. Never affects blockchain behavior. */
  metadata?: Record<string, unknown>;
  /** Arbitrary developer-defined options; preserved verbatim by the SDK. */
  options?: Record<string, unknown>;
}

/** Publicly resolved account alias. NEVER contains a private key. */
export interface ResolvedAccount {
  alias: string;
  account: string;
  options?: Record<string, unknown>;
}

/** Internal signing credentials. Never returned by public account APIs. */
export interface ResolvedSigningAccount extends ResolvedAccount {
  key: string;
}

/** Safe, serializable description of a configuration (no secrets). */
export interface HiveConfigSummary {
  name: string;
  accountAliases: string[];
  /** Which aliases declare a signing key reference (never the key itself). */
  signingAliases: string[];
  metadata: Record<string, unknown>;
  options: Record<string, unknown>;
}

export const DEFAULT_CONFIG_NAME = "default";
