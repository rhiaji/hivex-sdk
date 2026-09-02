/**
 * Configuration / account / signing errors.
 *
 * None of these errors ever contain private key material, environment values
 * or secret contents — only names and aliases.
 */
import { HiveSdkError } from "../types/index";

export class HiveConfigurationError extends HiveSdkError {
  constructor(message: string, raw?: unknown) {
    super("CONFIG_INVALID", message, raw);
    this.name = "HiveConfigurationError";
  }
}

export class HiveAccountNotFoundError extends HiveSdkError {
  constructor(alias: string) {
    super("ACCOUNT_ALIAS_NOT_FOUND", `Account alias "${alias}" was not found in the configuration.`, {
      alias,
    });
    this.name = "HiveAccountNotFoundError";
  }
}

export class HiveAccountResolutionError extends HiveSdkError {
  constructor(message: string, raw?: unknown) {
    super("ACCOUNT_RESOLUTION_ERROR", message, raw);
    this.name = "HiveAccountResolutionError";
  }
}

export class HiveEnvironmentVariableMissingError extends HiveSdkError {
  constructor(name: string, context: { alias?: string; purpose?: string } = {}) {
    super(
      "ENV_VAR_MISSING",
      context.purpose === "key"
        ? `Required signing environment variable "${name}" was not found.`
        : `Required environment variable "${name}" was not found.`,
      { variable: name, ...context },
    );
    this.name = "HiveEnvironmentVariableMissingError";
  }
}

export class HiveSigningKeyMissingError extends HiveSdkError {
  constructor(alias: string) {
    super(
      "SIGNING_KEY_MISSING",
      `A signing key is required for backend transaction signing. ` +
        `The account alias "${alias}" does not provide "key" or "keyEnv".`,
      { alias },
    );
    this.name = "HiveSigningKeyMissingError";
  }
}

export class HiveSigningError extends HiveSdkError {
  constructor(message: string, raw?: unknown) {
    super("SIGNING_ERROR", message, raw);
    this.name = "HiveSigningError";
  }
}
