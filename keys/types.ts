/**
 * Key management types.
 *
 * The key system is responsible ONLY for storing and retrieving signing keys
 * by id. It never signs transactions and never serializes key material.
 */

/**
 * External key source. Implement this to integrate environment variables,
 * AWS Secrets Manager, Vault, Google Secret Manager or any custom system.
 */
export interface KeyProvider {
  getKey(keyId: string): Promise<string | undefined>;
}

export interface KeyRegistryOptions {
  /** Optional external provider consulted after the in-memory registry. */
  provider?: KeyProvider;
}
