import { HiveConfigurationError } from "../errors/index";
import type { HiveAccountConfig } from "./types";

/**
 * Brand used to recognize SDK account references at runtime. Defined with
 * `Symbol.for` so references stay recognizable across module instances.
 */
const ACCOUNT_REFERENCE_BRAND = Symbol.for("hive-sdk.account-reference");

/**
 * Public, key-free handle to a configured backend account.
 *
 * Backend issuer operations take `from: AccountReference` — never a magic
 * alias string. A reference carries the alias, its owning configuration and
 * the environment variable NAMES it will resolve from. It NEVER carries a
 * resolved Hive account name, a private key or any other secret: environment
 * resolution happens internally, at signing time.
 */
export interface AccountReference {
  /** Alias declared in the configuration (e.g. "treasury"). */
  readonly alias: string;
  /** Name of the owning configuration context ("default" for the root client). */
  readonly config: string;
  /** Environment variable holding the Hive account name, when configured that way. */
  readonly accountEnv?: string;
  /** Environment variable holding the signing key, when configured that way. */
  readonly keyEnv?: string;
  /** Whether the alias declares any signing credential (never the credential itself). */
  readonly signing: boolean;
  /** Developer-defined options attached to the alias. */
  readonly options?: Record<string, unknown>;
}

/** Build the immutable, key-free reference exposed as `context.accounts.<alias>`. */
export function createAccountReference(
  config: string,
  alias: string,
  entry: HiveAccountConfig,
): AccountReference {
  const reference: AccountReference = {
    alias,
    config,
    ...(entry.accountEnv ? { accountEnv: entry.accountEnv } : {}),
    ...(entry.keyEnv ? { keyEnv: entry.keyEnv } : {}),
    signing: entry.key !== undefined || entry.keyEnv !== undefined,
    ...(entry.options ? { options: entry.options } : {}),
  };

  Object.defineProperty(reference, ACCOUNT_REFERENCE_BRAND, {
    value: true,
    enumerable: false,
    writable: false,
  });

  return Object.freeze(reference);
}

/** Runtime type guard for account references. */
export function isAccountReference(value: unknown): value is AccountReference {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[ACCOUNT_REFERENCE_BRAND] === true
  );
}

/**
 * Validate a `from` value passed to a backend issuer operation and return the
 * alias it points at. String aliases are rejected on purpose.
 */
export function requireAccountReference(value: unknown, configName: string): AccountReference {
  if (typeof value === "string") {
    throw new HiveConfigurationError(
      `"from" must be an SDK account reference such as hive.accounts.${value} or ` +
        `hive.configs.<name>.accounts.${value} — string aliases are no longer accepted.`,
      { alias: value, config: configName },
    );
  }
  if (!isAccountReference(value)) {
    throw new HiveConfigurationError(
      `"from" must be an SDK account reference (for example hive.accounts.treasury).`,
      { config: configName },
    );
  }
  if (value.config !== configName) {
    throw new HiveConfigurationError(
      `Account reference "${value.alias}" belongs to configuration "${value.config}" ` +
        `and cannot be used with configuration "${configName}".`,
      { alias: value.alias, config: configName, referenceConfig: value.config },
    );
  }
  return value;
}
