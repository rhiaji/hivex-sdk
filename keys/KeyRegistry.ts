import { HiveSdkError } from "../types/index";
import { assertNonEmptyString } from "../utils/validation";
import type { KeyProvider, KeyRegistryOptions } from "./types";

/**
 * In-memory key registry with optional external provider fallback.
 *
 * Resolution order:
 *   1. Registered in-memory key
 *   2. External key provider
 *   3. undefined (callers raise KEY_NOT_FOUND)
 *
 * Key material is never logged, serialized or exposed through list().
 */
export class KeyRegistry {
  /** Private field so the keys never appear in JSON.stringify output. */
  readonly #keys = new Map<string, string>();
  #provider: KeyProvider | undefined;

  constructor(options: KeyRegistryOptions = {}) {
    this.#provider = options.provider;
  }

  /** Register a signing key under an id. */
  add(keyId: string, key: string): this {
    assertNonEmptyString(keyId, "keyId");
    if (typeof key !== "string" || key.trim() === "") {
      throw new HiveSdkError("VALIDATION_ERROR", `Key "${keyId}" must be a non-empty string`);
    }
    this.#keys.set(keyId, key);
    return this;
  }

  /** Install an external key provider (secret manager, vault, env, ...). */
  setProvider(provider: KeyProvider | undefined): this {
    if (provider && typeof provider.getKey !== "function") {
      throw new HiveSdkError("VALIDATION_ERROR", "Key provider must implement getKey(keyId)");
    }
    this.#provider = provider;
    return this;
  }

  hasProvider(): boolean {
    return this.#provider !== undefined;
  }

  /** Is the key available in memory? Does not consult the provider. */
  has(keyId: string): boolean {
    return this.#keys.has(keyId);
  }

  /** Retrieve a key. Returns undefined when no source can supply it. */
  async get(keyId: string): Promise<string | undefined> {
    assertNonEmptyString(keyId, "keyId");

    const local = this.#keys.get(keyId);
    if (local !== undefined) return local;

    if (!this.#provider) return undefined;

    let fromProvider: string | undefined;
    try {
      fromProvider = await this.#provider.getKey(keyId);
    } catch (error) {
      // Never include the underlying value in the error surface.
      throw new HiveSdkError(
        "KEY_PROVIDER_ERROR",
        `Key provider failed while resolving key id "${keyId}"`,
        { keyId, message: (error as Error)?.message },
      );
    }

    if (fromProvider === undefined) return undefined;
    if (typeof fromProvider !== "string" || fromProvider.trim() === "") {
      throw new HiveSdkError(
        "KEY_PROVIDER_ERROR",
        `Key provider returned an invalid value for key id "${keyId}"`,
        { keyId },
      );
    }
    return fromProvider;
  }

  /** Retrieve a key or throw KEY_NOT_FOUND. */
  async require(keyId: string): Promise<string> {
    const key = await this.get(keyId);
    if (key === undefined) {
      throw new HiveSdkError("KEY_NOT_FOUND", `Signing key not found for key id "${keyId}"`, {
        keyId,
      });
    }
    return key;
  }

  /** Remove an in-memory key. */
  remove(keyId: string): boolean {
    return this.#keys.delete(keyId);
  }

  /** Remove every in-memory key. */
  clear(): void {
    this.#keys.clear();
  }

  /** Key IDs only — never key material. */
  list(): string[] {
    return [...this.#keys.keys()];
  }

  /** Guard against accidental serialization of key material. */
  toJSON(): { keyIds: string[]; hasProvider: boolean } {
    return { keyIds: this.list(), hasProvider: this.hasProvider() };
  }
}
