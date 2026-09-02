/**
 * Configuration types.
 *
 * A configuration is whatever object the developer passes to `new HiveClient(...)`.
 * The SDK stores it verbatim and exposes it as `hive.configs`. It does not
 * interpret the structure, and it has no notion of environments, staging,
 * production or active configuration contexts.
 *
 * The single key the SDK does understand is the root-level `accounts` map,
 * which declares key-free account aliases used by backend signing. Aliases may
 * reference an environment variable name (`accountEnv` / `keyEnv`) that is
 * resolved lazily, only when an operation actually needs it.
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

/**
 * Developer-owned configuration.
 *
 * Only `accounts` has meaning to the SDK; every other key is application data
 * kept exactly as provided and reachable through `hive.configs`.
 */
export interface HiveConfig {
  /** Developer-defined account aliases. Keys are arbitrary. */
  accounts?: Record<string, HiveAccountConfig>;
  /** Any other developer-defined structure. */
  [key: string]: unknown;
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
