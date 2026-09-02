import { CustomJsonBuilder } from "../transaction/CustomJsonBuilder";
import { HiveSdkError } from "../types/index";
import { isPlainObject } from "../utils/validation";
import { KeychainPayments } from "./KeychainPayments";
import type {
  HiveKeychainApi,
  KeychainCustomJsonInput,
  KeychainCustomJsonRawInput,
  KeychainResponse,
  KeychainResult,
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

    if (!response || response.success !== true) {
      const message =
        typeof response?.message === "string" && response.message.trim() !== ""
          ? response.message
          : "Keychain transaction failed";
      const rejected = /cancel|reject|declin/i.test(message);
      throw new HiveSdkError(
        rejected ? "KEYCHAIN_REJECTED" : "KEYCHAIN_ERROR",
        rejected ? "Transaction rejected by user" : message,
        response,
      );
    }

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

    if (!response || response.success !== true) {
      const message =
        typeof response?.message === "string" && response.message.trim() !== ""
          ? response.message
          : "Keychain transaction failed";
      const rejected = /cancel|reject|declin/i.test(message);
      throw new HiveSdkError(
        rejected ? "KEYCHAIN_REJECTED" : "KEYCHAIN_ERROR",
        rejected ? "Transaction rejected by user" : message,
        response,
      );
    }

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

    if (isNative && typeof keychain.requestTransfer !== "function") {
      throw new HiveSdkError(
        "KEYCHAIN_UNAVAILABLE",
        "This Hive Keychain version does not support transfer requests",
      );
    }
    if (!isNative && typeof keychain.requestSendToken !== "function") {
      throw new HiveSdkError(
        "KEYCHAIN_UNAVAILABLE",
        "This Hive Keychain version does not support Hive Engine token transfers",
      );
    }

    const response = await new Promise<KeychainResponse>((resolve, reject) => {
      try {
        if (isNative) {
          keychain.requestTransfer!(
            input.username,
            input.to,
            input.amount,
            input.memo,
            currency,
            (res) => resolve(res),
            input.enforce ?? true,
          );
        } else {
          keychain.requestSendToken!(
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

    if (!response || response.success !== true) {
      const message =
        typeof response?.message === "string" && response.message.trim() !== ""
          ? response.message
          : "Keychain transfer failed";
      const rejected = /cancel|reject|declin/i.test(message);
      throw new HiveSdkError(
        rejected ? "KEYCHAIN_REJECTED" : "KEYCHAIN_ERROR",
        rejected ? "Transaction rejected by user" : message,
        response,
      );
    }

    return {
      success: true,
      transactionId: extractTransactionId(response),
      raw: response,
    };
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
