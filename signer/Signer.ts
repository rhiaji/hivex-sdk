import { HiveSdkError } from "../types/index";
import { HiveSigningKeyMissingError } from "../errors/index";
import { assertNonEmptyString } from "../utils/validation";
import { UnavailableSigner } from "./TransactionSigner";
import type { SignRequest, SignResult, TransactionSigner } from "./types";

/**
 * Signing facade exposed as `hive.signer`.
 *
 * It receives resolved signing credentials from the account resolver, delegates
 * to the installed signing strategy and returns the signed transaction. There
 * is no key registry, no key id and no global key store: keys arrive with the
 * request and are discarded afterwards.
 */
export class Signer {
  private strategy: TransactionSigner;

  constructor(strategy: TransactionSigner = new UnavailableSigner()) {
    this.strategy = strategy;
  }

  /** Install a signing strategy (local key, hardware wallet, remote signer). */
  use(strategy: TransactionSigner): this {
    if (!strategy || typeof strategy.sign !== "function") {
      throw new HiveSdkError("VALIDATION_ERROR", "A signer must implement sign(request)");
    }
    this.strategy = strategy;
    return this;
  }

  /** Name of the installed strategy. */
  get strategyName(): string {
    return this.strategy.name;
  }

  /** Is a real signing strategy installed? */
  isConfigured(): boolean {
    return this.strategy.name !== "unavailable";
  }

  /** Sign a transaction with the resolved key carried by the request. */
  async sign(request: SignRequest): Promise<SignResult> {
    assertNonEmptyString(request?.account, "account");
    if (request.transaction === undefined || request.transaction === null) {
      throw new HiveSdkError("VALIDATION_ERROR", `"transaction" is required to sign`);
    }

    if (!this.isConfigured()) {
      // Surfaces SIGNER_NOT_CONFIGURED before any key material is touched.
      return this.strategy.sign(request);
    }

    if (typeof request.key !== "string" || request.key.trim() === "") {
      throw new HiveSigningKeyMissingError(request.alias ?? request.account);
    }

    return this.strategy.sign(request, request.key);
  }
}
