import type { HiveAuthority } from "../types/index";

export interface KeychainCustomJsonInput<T = Record<string, unknown>> {
  username: string;
  id: string;
  action: string;
  metadata?: T | null;
  authority?: HiveAuthority;
  message?: string;
}

export interface KeychainCustomJsonRawInput {
  username: string;
  id: string;
  /** Already-serialized json body, broadcast verbatim. */
  json: string;
  authority?: HiveAuthority;
  message?: string;
}

export interface KeychainSignInInput {
  username: string;
  /** App-provided nonce or challenge text to sign. */
  message: string;
  /** Key used for the signature. Defaults to posting. */
  authority?: HiveAuthority;
}

export interface KeychainSignInResult {
  success: true;
  username: string;
  message: string;
  authority: HiveAuthority;
  signature: string | null;
  signedAt: string;
  raw: unknown;
}

export interface KeychainResult {
  success: true;
  transactionId: string | null;
  raw: unknown;
}

/** Shape of the Hive Keychain callback response. */
export interface KeychainResponse {
  success?: boolean;
  error?: unknown;
  message?: string;
  result?: unknown;
  data?: unknown;
  request_id?: number;
}

export interface KeychainTransferInput {
  username: string;
  to: string;
  /** Decimal string quantity, e.g. "10.000". */
  amount: string;
  /**
   * "HIVE" or "HBD" for a native Layer 1 transfer, or any Hive Engine token
   * symbol (e.g. "SWAP.HIVE", "SCRAP") for a Layer 2 token transfer. The SDK
   * picks the matching Keychain request automatically.
   */
  currency: string;
  memo: string;
  /** Prevent the user from changing the recipient (native only). Default true. */
  enforce?: boolean;
}

export interface HiveKeychainApi {
  requestTransfer?: (
    account: string,
    to: string,
    amount: string,
    memo: string,
    currency: string,
    callback: (response: KeychainResponse) => void,
    enforce?: boolean,
  ) => void;
  /** Hive Engine token transfer (Layer 2), signed with the active key. */
  requestSendToken?: (
    account: string,
    to: string,
    amount: string,
    memo: string,
    currency: string,
    callback: (response: KeychainResponse) => void,
  ) => void;
  requestCustomJson: (
    account: string,
    id: string,
    keyType: string,
    json: string,
    displayMessage: string,
    callback: (response: KeychainResponse) => void,
  ) => void;
  requestSignBuffer?: (
    account: string,
    message: string,
    keyType: string,
    callback: (response: KeychainResponse) => void,
  ) => void;
  requestHandshake?: (callback: () => void) => void;
}

declare global {
  interface Window {
    hive_keychain?: HiveKeychainApi;
  }
}
