/**
 * Shared public types for the HiveXPH SDK.
 */

/** Configuration for the HiveClient. */
export interface HiveClientConfig {
  /** JSON-RPC endpoint. Defaults to DEFAULT_RPC_ENDPOINT. */
  endpoint?: string;
  /** Beacon node-health API URL. Defaults to DEFAULT_BEACON_URL. */
  beaconUrl?: string;
}

/** Hive authority required by a custom_json operation. */
export type HiveAuthority = "posting" | "active";

/**
 * The strict standardized Custom JSON payload broadcast by this SDK.
 * No timestamps: the blockchain is the authoritative clock.
 */
export interface CustomJsonPayload<T = Record<string, unknown>> {
  action: string;
  metadata: T | null;
}

/** Developer-facing input; metadata may be omitted and defaults to null. */
export interface CustomJsonInput<T = Record<string, unknown>> {
  action: string;
  metadata?: T | null;
}

/** Raw Hive `custom_json` operation body. */
export interface CustomJsonOperationValue {
  required_auths: string[];
  required_posting_auths: string[];
  id: string;
  json: string;
}

/** Normalized event produced by both readers. */
export interface CustomJsonEvent<T = Record<string, unknown>> {
  /** Deterministic id: `${blockNumber}-${transactionIndex}-${operationIndex}` */
  eventId: string;
  transactionId: string | null;
  blockNumber: number;
  blockTimestamp: string;
  transactionIndex: number;
  operationIndex: number;
  /** Derived authority account when exactly one authority is present. */
  account: string | null;
  id: string;
  action: string;
  metadata: T | null;
  requiredAuths: string[];
  requiredPostingAuths: string[];
  raw: unknown;
}

/** Error codes surfaced by the SDK. */
export type HiveSdkErrorCode =
  | "VALIDATION_ERROR"
  | "HTTP_ERROR"
  | "RPC_ERROR"
  | "KEYCHAIN_UNAVAILABLE"
  | "KEYCHAIN_REJECTED"
  | "KEYCHAIN_ERROR"
  | "PARSE_ERROR"
  | "NOT_FOUND"
  | "ACCOUNT_ALIAS_NOT_FOUND"
  | "ACCOUNT_CONFIG_INVALID"
  | "CONFIG_INVALID"
  | "ACCOUNT_RESOLUTION_ERROR"
  | "ENV_VAR_MISSING"
  | "SIGNING_KEY_MISSING"
  | "SIGNING_ERROR"
  | "BROADCAST_ERROR"
  | "INSUFFICIENT_BEE"
  | "TOKEN_ALREADY_EXISTS"
  | "NFT_ALREADY_EXISTS"
  | "NFT_VALIDATION_ERROR"
  | "NFT_SYMBOL_ERROR"
  | "NFT_TRANSFER_LIMIT_ERROR"
  | "NFT_ISSUANCE_ERROR"
  | "NFT_TRANSFER_ERROR"
  | "NFT_BURN_ERROR"
  | "NFT_ACCOUNT_RESOLUTION_ERROR";

export class HiveSdkError extends Error {
  public readonly code: HiveSdkErrorCode;
  public readonly raw: unknown;

  constructor(code: HiveSdkErrorCode, message: string, raw?: unknown) {
    super(message);
    this.name = "HiveSdkError";
    this.code = code;
    this.raw = raw ?? null;
  }
}
