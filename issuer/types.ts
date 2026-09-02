/** Shared issuer types. */

/** Consistent result returned by every issuer operation. */
export interface IssuerTransactionResult {
  success: boolean;
  transactionId?: string;
  /** Destination account of the operation, when applicable. */
  account?: string;
  raw: unknown;
}

/**
 * Offline representation of an issuer operation: the resolved alias plus the
 * exact custom_json operation that would be signed and broadcast. Building a
 * preview never resolves a private key and never touches the network.
 */
export interface IssuerOperationPreview {
  /** Configuration account alias that was resolved. */
  alias: string;
  /** Blockchain account the operation is signed by. */
  account: string;
  /** Destination account of the operation, when applicable. */
  destination?: string;
  /** custom_json application id used by the operation. */
  id: string;
  /** Serialized custom_json body. */
  json: string;
  /** Full `["custom_json", { ... }]` operation tuple. */
  operation: unknown[];
}

export interface IssuerOperationOptions {
  /** Custom JSON application id. Defaults to the configuration option `applicationId`. */
  id?: string;
}
