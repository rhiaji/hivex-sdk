import { CustomJsonBuilder } from "../transaction/CustomJsonBuilder";
import { HiveSdkError } from "../types/index";
import { assertNonEmptyString, isPlainObject } from "../utils/validation";
import { KeychainPayments } from "./KeychainPayments";
import type {
  HiveKeychainApi,
  KeychainCustomJsonInput,
  KeychainCustomJsonRawInput,
  KeychainResponse,
  KeychainResult,
  KeychainSignInInput,
  KeychainSignInResult,
  KeychainTransferInput,
} from "./types";

/**
 * Browser-only client wrapping the Hive Keychain callback API in Promises.
 * The SDK never touches private keys — Keychain performs all signing.
 */
export class KeychainClient {
  private readonly builder: CustomJsonBuilder;

  /** Native and Layer 2 payments with standardized triggers. */
  public readonly payments: KeychainPayments;

  constructor(builder: CustomJsonBuilder = new CustomJsonBuilder()) {
    this.builder = builder;
    this.payments = new KeychainPayments(this);
  }

  /** Is the Hive Keychain browser extension present? */
  isAvailable(): boolean {
    return typeof window !== "undefined" && typeof window.hive_keychain !== "undefined";
  }

  private getKeychain(): HiveKeychainApi {
    if (typeof window === "undefined" || !window.hive_keychain) {
      throw new HiveSdkError("KEYCHAIN_UNAVAILABLE", "Hive Keychain is not installed");
    }
    return window.hive_keychain;
  }

  /**
   * Request a Hive Keychain sign-in signature for an app-provided challenge.
   * The returned signature can be verified by the app to prove account ownership.
   */
  async requestSignIn(input: KeychainSignInInput): Promise<KeychainSignInResult> {
    const keychain = this.getKeychain();
    if (typeof keychain.requestSignBuffer !== "function") {
      throw new HiveSdkError(
        "KEYCHAIN_UNAVAILABLE",
        "This Hive Keychain version does not support sign-in requests",
      );
    }
    const requestSignBuffer = keychain.requestSignBuffer.bind(keychain);

    assertNonEmptyString(input.username, "username");
    assertNonEmptyString(input.message, "message");
    const authority = input.authority ?? "posting";
    if (authority !== "posting" && authority !== "active") {
      throw new HiveSdkError("VALIDATION_ERROR", `"authority" must be "posting" or "active"`);
    }
    const keyType = authority === "active" ? "Active" : "Posting";

    const response = await new Promise<KeychainResponse>((resolve, reject) => {
      try {
        requestSignBuffer(input.username, input.message, keyType, (res) => resolve(res));
      } catch (error) {
        reject(
          new HiveSdkError(
            "KEYCHAIN_ERROR",
            `Keychain sign-in failed: ${(error as Error).message}`,
            error,
          ),
        );
      }
    });

    assertKeychainSuccess(response, "Keychain sign-in failed", "Sign-in request rejected by user");

    return {
      success: true,
      username: input.username,
      message: input.message,
      authority,
      signature: extractSignature(response),
      signedAt: new Date().toISOString(),
      raw: response,
    };
  }

  /**
   * Build the standardized payload and broadcast it through Hive Keychain.
   */
  async customJson<T = Record<string, unknown>>(
    input: KeychainCustomJsonInput<T>,
  ): Promise<KeychainResult> {
    const keychain = this.getKeychain();

    const operation = this.builder.buildOperation<T>({
      username: input.username,
      id: input.id,
      action: input.action,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      ...(input.authority === undefined ? {} : { authority: input.authority }),
    });

    const keyType = (input.authority ?? "posting") === "active" ? "Active" : "Posting";
    const displayMessage = input.message ?? `${input.id}: ${input.action}`;

    const response = await new Promise<KeychainResponse>((resolve, reject) => {
      try {
        keychain.requestCustomJson(
          input.username,
          operation.id,
          keyType,
          operation.json,
          displayMessage,
          (res) => resolve(res),
        );
      } catch (error) {
        reject(
          new HiveSdkError(
            "KEYCHAIN_ERROR",
            `Keychain transaction failed: ${(error as Error).message}`,
            error,
          ),
        );
      }
    });

    assertKeychainSuccess(response, "Keychain transaction failed", "Transaction rejected by user");

    return {
      success: true,
      transactionId: extractTransactionId(response),
      raw: response,
    };
  }

  /**
   * Broadcast an already-serialized custom_json body through Hive Keychain.
   * Used for protocols with their own json shape (e.g. Hive Engine contract
   * actions) where the standardized `{ action, metadata }` envelope must not
   * be applied.
   */
  async customJsonRaw(input: KeychainCustomJsonRawInput): Promise<KeychainResult> {
    const keychain = this.getKeychain();
    const keyType = (input.authority ?? "posting") === "active" ? "Active" : "Posting";
    const displayMessage = input.message ?? input.id;

    const response = await new Promise<KeychainResponse>((resolve, reject) => {
      try {
        keychain.requestCustomJson(
          input.username,
          input.id,
          keyType,
          input.json,
          displayMessage,
          (res) => resolve(res),
        );
      } catch (error) {
        reject(
          new HiveSdkError(
            "KEYCHAIN_ERROR",
            `Keychain transaction failed: ${(error as Error).message}`,
            error,
          ),
        );
      }
    });

    assertKeychainSuccess(response, "Keychain transaction failed", "Transaction rejected by user");

    return {
      success: true,
      transactionId: extractTransactionId(response),
      raw: response,
    };
  }

  /**
   * Request a transfer through Hive Keychain.
   *
   * `currency: "HIVE" | "HBD"` is a native Layer 1 transfer. Any other symbol
   * (e.g. "SWAP.HIVE", "SCRAP") is a Hive Engine token transfer and is routed
   * to Keychain's token request. Both are dedicated Keychain requests — not a
   * custom_json — and both carry the memo verbatim.
   */
  async requestTransfer(input: KeychainTransferInput): Promise<KeychainResult> {
    const keychain = this.getKeychain();
    const currency = input.currency.trim().toUpperCase();
    const isNative = currency === "HIVE" || currency === "HBD";

    const response = await new Promise<KeychainResponse>((resolve, reject) => {
      try {
        if (isNative) {
          if (typeof keychain.requestTransfer !== "function") {
            reject(
              new HiveSdkError(
                "KEYCHAIN_UNAVAILABLE",
                "This Hive Keychain version does not support transfer requests",
              ),
            );
            return;
          }
          const requestTransfer = keychain.requestTransfer.bind(keychain);
          requestTransfer(
            input.username,
            input.to,
            input.amount,
            input.memo,
            currency,
            (res) => resolve(res),
            input.enforce ?? true,
          );
        } else {
          if (typeof keychain.requestSendToken !== "function") {
            reject(
              new HiveSdkError(
                "KEYCHAIN_UNAVAILABLE",
                "This Hive Keychain version does not support Hive Engine token transfers",
              ),
            );
            return;
          }
          const requestSendToken = keychain.requestSendToken.bind(keychain);
          requestSendToken(
            input.username,
            input.to,
            input.amount,
            input.memo,
            currency,
            (res) => resolve(res),
          );
        }
      } catch (error) {
        reject(
          new HiveSdkError(
            "KEYCHAIN_ERROR",
            `Keychain transfer failed: ${(error as Error).message}`,
            error,
          ),
        );
      }
    });

    assertKeychainSuccess(response, "Keychain transfer failed", "Transaction rejected by user");

    return {
      success: true,
      transactionId: extractTransactionId(response),
      raw: response,
    };
  }
}

function assertKeychainSuccess(
  response: KeychainResponse | undefined,
  fallbackMessage: string,
  rejectedMessage: string,
): asserts response is KeychainResponse {
  if (!response || response.success !== true) {
    const message =
      typeof response?.message === "string" && response.message.trim() !== ""
        ? response.message
        : fallbackMessage;
    const rejected = /cancel|reject|declin/i.test(message);
    throw new HiveSdkError(
      rejected ? "KEYCHAIN_REJECTED" : "KEYCHAIN_ERROR",
      rejected ? rejectedMessage : message,
      response,
    );
  }
}

function extractTransactionId(response: KeychainResponse): string | null {
  const candidates: unknown[] = [response.result, response.data];
  for (const candidate of candidates) {
    if (isPlainObject(candidate)) {
      const id = candidate["id"] ?? candidate["tx_id"] ?? candidate["trx_id"];
      if (typeof id === "string" && id.length > 0) return id;
    }
  }
  return null;
}

function extractSignature(response: KeychainResponse): string | null {
  const candidates: unknown[] = [response.result, response.data, response];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
    if (isPlainObject(candidate)) {
      const signature = candidate["signature"] ?? candidate["sig"] ?? candidate["signed_message"];
      if (typeof signature === "string" && signature.length > 0) return signature;
    }
  }
  return null;
}
