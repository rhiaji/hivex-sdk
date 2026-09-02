import type { KeyProvider } from "./types";

export type { KeyProvider };

/**
 * Convenience provider backed by a plain lookup function.
 * Useful for environment variables or any custom secret system.
 *
 * @example
 * hive.keys.setProvider(createKeyProvider((keyId) => process.env[keyId]));
 */
export function createKeyProvider(
  lookup: (keyId: string) => string | undefined | Promise<string | undefined>,
): KeyProvider {
  return {
    async getKey(keyId: string) {
      return await lookup(keyId);
    },
  };
}
