import { HIVE_ENGINE_AUTHORITY } from "../engine/constants";
import { enginePaymentBuilder } from "../payments/engine/EnginePaymentBuilder";
import { hivePaymentBuilder } from "../payments/hive/HivePaymentBuilder";
import { HiveSdkError } from "../types/index";
import type { KeychainClient } from "./KeychainClient";
import type { KeychainResponse, KeychainResult } from "./types";

export interface KeychainHivePaymentInput<T = Record<string, unknown>> {
  /** Hive account signing in the browser. */
  username: string;
  /** Destination account. */
  account: string;
  /** Decimal string, e.g. "10.000". Never a number. */
  amount: string;
  /** "HIVE" or "HBD". */
  symbol: string;
  action: string;
  metadata?: T | null;
  /** Optional confirmation message shown by Keychain. */
  message?: string;
}

export interface KeychainEnginePaymentInput<T = Record<string, unknown>> {
  username: string;
  account: string;
  symbol: string;
  quantity: string;
  action: string;
  metadata?: T | null;
  message?: string;
}

/**
 * Native HIVE / HBD payments signed by the Hive Keychain extension.
 * Native transfers use Keychain's dedicated transfer request — NOT custom_json.
 */
export class KeychainHivePayments {
  private readonly client: KeychainClient;

  constructor(client: KeychainClient) {
    this.client = client;
  }

  /** Request a native transfer whose memo carries the standardized trigger. */
  async transfer<T = Record<string, unknown>>(
    input: KeychainHivePaymentInput<T>,
  ): Promise<KeychainResult> {
    if (typeof input?.username !== "string" || input.username.trim() === "") {
      throw new HiveSdkError("VALIDATION_ERROR", `"username" must be a non-empty account name`);
    }
    const built = hivePaymentBuilder.build<T>(input);
    // "10.000 HIVE" -> Keychain wants the quantity and the currency apart.
    const [quantity] = built.amount.split(" ");
    return this.client.requestTransfer({
      username: input.username,
      to: built.account,
      amount: quantity as string,
      currency: built.symbol,
      memo: built.memo,
    });
  }
}

/**
 * Hive Engine (Layer 2) payments signed by Hive Keychain. These are
 * `custom_json` operations against the sidechain, signed with the active key.
 */
export class KeychainEnginePayments {
  private readonly client: KeychainClient;

  constructor(client: KeychainClient) {
    this.client = client;
  }

  async transfer<T = Record<string, unknown>>(
    input: KeychainEnginePaymentInput<T>,
  ): Promise<KeychainResult> {
    const built = enginePaymentBuilder.build<T>(input);
    return this.client.customJsonRaw({
      username: input.username,
      id: built.id,
      json: JSON.stringify(built.engineAction),
      authority: HIVE_ENGINE_AUTHORITY,
      ...(input.message ? { message: input.message } : {}),
    });
  }
}

/** `hive.keychain.payments` — browser payment namespace. */
export class KeychainPayments {
  public readonly hive: KeychainHivePayments;
  public readonly engine: KeychainEnginePayments;

  constructor(client: KeychainClient) {
    this.hive = new KeychainHivePayments(client);
    this.engine = new KeychainEnginePayments(client);
  }
}

/** Shared error normalization for Keychain responses. */
export function assertKeychainSuccess(response: KeychainResponse | undefined): void {
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
}
