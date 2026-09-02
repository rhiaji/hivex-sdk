import type { NormalizedNftOperation } from "../engine/NftOperationParser";
import type { ParsedPayment } from "../payments/types";
import type { PaymentSource } from "./stream/types";
import type { CustomJsonEvent } from "../types/index";

export interface ReadTransactionInput {
  transactionId: string;
  /** Optional custom_json id filter, applied to the derived `customJson` list. */
  id?: string;
  /** Optional standardized action filter, applied to the derived lists. */
  actions?: string[];
}

/** Blockchain position carried by every parsed operation. */
export interface TransactionOperationPosition {
  transactionId: string;
  /** null when the node did not report the block. */
  blockNumber: number | null;
  blockTimestamp: string | null;
  transactionIndex: number | null;
  operationIndex: number;
  /** Raw Hive operation name, e.g. "custom_json" or "transfer". */
  operationType: string;
  raw: unknown;
}

/** A `custom_json` operation, standardized or not. */
export interface CustomJsonOperationResult<T = Record<string, unknown>>
  extends TransactionOperationPosition {
  kind: "custom_json";
  id: string;
  account: string | null;
  standardized: boolean;
  action: string | null;
  metadata: T | null;
  /** Full normalized event, only when `standardized` is true. */
  event: CustomJsonEvent<T> | null;
  /** Why the payload was rejected, when `standardized` is false. */
  invalidReason: string | null;
}

/** A native or Layer 2 payment. Layer 2 stays `pending` until verified. */
export interface PaymentOperationResult<T = unknown> extends TransactionOperationPosition {
  kind: "payment";
  payment: ParsedPayment<T>;
  source: PaymentSource;
}

/** A Hive Engine NFT contract action. */
export interface NftOperationResult extends TransactionOperationPosition {
  kind: "nft";
  nft: NormalizedNftOperation;
}

/** Anything the SDK does not interpret. Never an error. */
export interface UnknownOperationResult extends TransactionOperationPosition {
  kind: "unknown";
}

export type TransactionOperationResult<T = Record<string, unknown>> =
  | CustomJsonOperationResult<T>
  | PaymentOperationResult<T>
  | NftOperationResult
  | UnknownOperationResult;

/** Normalized result of `hive.reader.transaction()`. */
export interface TransactionResult<T = Record<string, unknown>> {
  transactionId: string;
  blockNumber: number | null;
  blockTimestamp: string | null;
  transactionIndex: number | null;
  /** Every operation, in blockchain order. Unknown operations included. */
  operations: TransactionOperationResult<T>[];
  /** Standardized Custom JSON events, filtered by `id` / `actions`. */
  customJson: CustomJsonEvent<T>[];
  /** Payments, with triggers already associated. */
  payments: ParsedPayment<T>[];
  /** Hive Engine NFT operations. */
  nfts: NormalizedNftOperation[];
  /** custom_json operations that broke the standardized protocol. */
  invalid: { operationIndex: number; reason: string; raw: unknown }[];
  /** Transaction exactly as returned by the node. */
  raw: unknown;
}
