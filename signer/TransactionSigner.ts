import { HiveSdkError } from "../types/index";
import type { SignRequest, SignResult, TransactionSigner } from "./types";

export type { SignRequest, SignResult, TransactionSigner };

/**
 * Default strategy used when no signing implementation has been installed.
 *
 * This SDK deliberately ships no built-in cryptographic signing: implementing
 * Hive's transaction serialization + secp256k1 signature scheme incorrectly is
 * worse than not shipping it at all, and private keys must never be sent to an
 * RPC endpoint. Install a real signer with `hive.signer.use(...)`, or use
 * Hive Keychain in the browser.
 */
export class UnavailableSigner implements TransactionSigner {
  readonly name = "unavailable";

  async sign(request: SignRequest): Promise<SignResult> {
    throw new HiveSdkError(
      "SIGNER_NOT_CONFIGURED",
      "No transaction signer is configured. Install one with hive.signer.use(signer) " +
        "(backend private-key signing) or broadcast through hive.keychain in the browser.",
      { account: request.account },
    );
  }
}

/**
 * Adapter for any local signing library that can turn a transaction plus a
 * WIF private key into signatures. Keeps the cryptography outside the SDK.
 *
 * @example
 * import { PrivateKey, cryptoUtils } from "@hiveio/dhive";
 * hive.signer.use(createLocalKeySigner(async (tx, key) => {
 *   const signed = cryptoUtils.signTransaction(tx, [PrivateKey.from(key)]);
 *   return { transaction: signed, signatures: signed.signatures };
 * }));
 */
export function createLocalKeySigner(
  signFn: (transaction: unknown, key: string, request: SignRequest) => Promise<SignResult>,
  name = "local-key",
): TransactionSigner {
  return {
    name,
    async sign(request: SignRequest, key?: string): Promise<SignResult> {
      if (typeof key !== "string" || key.trim() === "") {
        throw new HiveSdkError(
          "SIGNING_ERROR",
          `A signing key is required to sign for account "${request.account}"`,
          { account: request.account },
        );
      }
      try {
        return await signFn(request.transaction, key, request);
      } catch (error) {
        throw new HiveSdkError("SIGNING_ERROR", "Transaction signing failed", {
          account: request.account,
          message: (error as Error)?.message,
        });
      }
    },
  };
}
