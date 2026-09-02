import {
  HiveAccountNotFoundError,
  HiveAccountResolutionError,
  HiveConfigurationError,
  HiveSigningKeyMissingError,
} from "../errors/index";
import { requireEnvValue } from "../environment/EnvironmentResolver";
import type { EnvironmentResolver } from "../environment/types";
import { assertNonEmptyString, isPlainObject } from "../utils/validation";
import type { HiveAccountConfig, ResolvedAccount, ResolvedSigningAccount } from "./types";

/**
 * Validate a single account alias entry.
 *
 * Rules:
 *  - exactly one of `account` / `accountEnv`
 *  - at most one of `key` / `keyEnv` (both optional)
 */
export function validateAccountConfig(alias: string, entry: unknown): void {
  if (!isPlainObject(entry)) {
    throw new HiveConfigurationError(
      `Account configuration for alias "${alias}" must be an object.`,
      { alias },
    );
  }

  const hasAccount = entry["account"] !== undefined;
  const hasAccountEnv = entry["accountEnv"] !== undefined;

  if (hasAccount === hasAccountEnv) {
    throw new HiveConfigurationError(
      `Account configuration for alias "${alias}" must provide exactly one of "account" or "accountEnv".`,
      { alias },
    );
  }
  if (hasAccount && (typeof entry["account"] !== "string" || entry["account"].trim() === "")) {
    throw new HiveConfigurationError(
      `Account configuration for alias "${alias}" has an invalid "account" value.`,
      { alias },
    );
  }
  if (
    hasAccountEnv &&
    (typeof entry["accountEnv"] !== "string" || entry["accountEnv"].trim() === "")
  ) {
    throw new HiveConfigurationError(
      `Account configuration for alias "${alias}" has an invalid "accountEnv" value.`,
      { alias },
    );
  }

  const hasKey = entry["key"] !== undefined;
  const hasKeyEnv = entry["keyEnv"] !== undefined;
  if (hasKey && hasKeyEnv) {
    throw new HiveConfigurationError(
      `Account configuration for alias "${alias}" may provide only one of "key" or "keyEnv".`,
      { alias },
    );
  }
  if (hasKey && (typeof entry["key"] !== "string" || entry["key"].trim() === "")) {
    // Never echo the value back.
    throw new HiveConfigurationError(
      `Invalid private key for configured signing account "${alias}".`,
      { alias },
    );
  }
  if (hasKeyEnv && (typeof entry["keyEnv"] !== "string" || entry["keyEnv"].trim() === "")) {
    throw new HiveConfigurationError(
      `Account configuration for alias "${alias}" has an invalid "keyEnv" value.`,
      { alias },
    );
  }
  if (entry["options"] !== undefined && !isPlainObject(entry["options"])) {
    throw new HiveConfigurationError(
      `Account configuration for alias "${alias}" has invalid "options".`,
      { alias },
    );
  }
}

/**
 * Centralized alias → account (and, only when signing, alias → key) resolution.
 *
 * Resolution is lazy: nothing is read from the environment until an alias is
 * actually used, and resolved private keys are never cached or stored.
 */
export class AccountResolver {
  private readonly accounts: Record<string, HiveAccountConfig>;
  private readonly environment: EnvironmentResolver;

  constructor(accounts: Record<string, HiveAccountConfig>, environment: EnvironmentResolver) {
    this.accounts = accounts;
    this.environment = environment;
  }

  /** Declared aliases. */
  list(): string[] {
    return Object.keys(this.accounts);
  }

  has(alias: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.accounts, alias);
  }

  /** Does this alias declare a signing key reference? (never reads the key) */
  hasSigningKey(alias: string): boolean {
    const entry = this.accounts[alias];
    return Boolean(entry && (entry.key !== undefined || entry.keyEnv !== undefined));
  }

  private entry(alias: string): HiveAccountConfig {
    assertNonEmptyString(alias, "alias");
    const entry = this.accounts[alias];
    if (!entry) throw new HiveAccountNotFoundError(alias);
    validateAccountConfig(alias, entry);
    return entry;
  }

  /** Alias → { alias, account }. Never includes key material. */
  resolve(alias: string): ResolvedAccount {
    const entry = this.entry(alias);

    const account =
      entry.account !== undefined
        ? entry.account.trim()
        : requireEnvValue(this.environment, entry.accountEnv as string, {
            alias,
            purpose: "account",
          }).trim();

    if (account === "") {
      throw new HiveAccountResolutionError(
        `Account alias "${alias}" resolved to an empty account name.`,
        { alias },
      );
    }

    return {
      alias,
      account,
      ...(entry.options ? { options: entry.options } : {}),
    };
  }

  /**
   * Internal-only: alias → { alias, account, key }. Called just before backend
   * signing; the returned key is used and then discarded by the caller.
   */
  resolveSigning(alias: string): ResolvedSigningAccount {
    const resolved = this.resolve(alias);
    const entry = this.entry(alias);

    if (entry.key === undefined && entry.keyEnv === undefined) {
      throw new HiveSigningKeyMissingError(alias);
    }

    const key =
      entry.key !== undefined
        ? entry.key
        : requireEnvValue(this.environment, entry.keyEnv as string, {
            alias,
            purpose: "key",
          });

    if (typeof key !== "string" || key.trim() === "") {
      throw new HiveAccountResolutionError(
        `Invalid private key for configured signing account "${alias}".`,
        { alias },
      );
    }

    return { ...resolved, key };
  }
}
