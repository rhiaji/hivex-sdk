import type { BlockStreamOptions } from "../stream/types";
import type { ActionPayload } from "../protocol/types";

/** Supported payment networks. Extensible on purpose. */
export type PaymentNetwork = "hive" | "engine";

/**
 * Payment lifecycle status.
 *
 * pending   — not yet sufficiently available to verify execution.
 * success   — the transfer AND (for Layer 2) its execution succeeded.
 * failed    — the transaction exists but execution failed.
 * invalid   — the transaction exists but does not match expectations.
 * not_found — the transaction cannot be found.
 */
export type PaymentStatus = "pending" | "success" | "failed" | "invalid" | "not_found";

/** Standardized trigger carried by the transfer memo. */
export type PaymentTrigger<T = unknown> = ActionPayload<T>;

/** Normalized transfer, identical shape for native and Layer 2 payments. */
export interface PaymentTransfer {
  from: string;
  account: string;
  symbol: string;
  /** Always a string — never a float. */
  quantity: string;
  /** Raw memo as broadcast, when available. */
  memo?: string | null;
}

/** Normalized payment produced by the parser, the validator and the stream. */
export interface ParsedPayment<T = unknown> {
  network: PaymentNetwork;
  transactionId: string | null;
  blockNumber?: number;
  /** Operation index inside the transaction — part of the idempotency key. */
  operationIndex?: number;
  /** null when execution has not been verified (parse-only results). */
  success: boolean | null;
  status: PaymentStatus;
  transfer: PaymentTransfer;
  trigger: PaymentTrigger<T> | null;
  error?: string;
  raw?: unknown;
}

/** Optional expectations checked by the validator. All fields are optional. */
export interface PaymentExpectation {
  from?: string;
  account?: string;
  symbol?: string;
  quantity?: string;
  action?: string;
}

export interface PaymentParseInput {
  transactionId: string;
}

export interface PaymentValidateInput extends PaymentParseInput {
  expected?: PaymentExpectation;
}

/** Validation results are normalized payments with a verified status. */
export type PaymentValidationResult<T = unknown> = ParsedPayment<T>;

/** Payment watch filters. Every field is optional. */
export interface PaymentStreamFilters {
  from?: string;
  account?: string;
  symbol?: string;
  /** Exact amount, compared as a decimal string. */
  quantity?: string;
  /** Application actions from the trigger, OR-matched. Implies a valid trigger. */
  actions?: string[];
  /** Only emit transfers carrying a valid standardized trigger. */
  requireTrigger?: boolean;
}

export interface PaymentStreamOptions<T = unknown> extends BlockStreamOptions {
  filters?: PaymentStreamFilters;
  /** Only verified payments (`success === true`). */
  onSuccess?: (payment: ParsedPayment<T>) => void | Promise<void>;
  /** Payments whose execution failed (`success === false`). */
  onFailed?: (payment: ParsedPayment<T>) => void | Promise<void>;
}

