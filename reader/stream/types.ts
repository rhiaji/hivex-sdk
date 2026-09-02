import type { ParsedPayment } from "../../payments/types";
import type { BlockStreamOptions } from "../../stream/types";
import type { CustomJsonEvent } from "../../types/index";

/** Normalized event kinds produced by the unified stream engine. */
export type StreamEventType = "custom_json" | "payment";

/** Blockchain position shared by every normalized event. */
export interface StreamEventPosition {
  /** Transaction id, or null when the node omitted it. */
  transactionId: string | null;
  blockNumber: number;
  blockTimestamp: string;
  transactionIndex: number;
  operationIndex: number;
}

/**
 * A `custom_json` operation, standardized or raw.
 *
 * `standardized` is true when the payload follows the `{ action, metadata }`
 * protocol; raw protocol payloads are still emitted with `json` populated.
 */
export interface CustomJsonStreamEvent<T = Record<string, unknown>> extends StreamEventPosition {
  type: "custom_json";
  account: string | null;
  id: string;
  /** Standardized action, or null for raw protocol payloads. */
  action: string | null;
  metadata: T | null;
  standardized: boolean;
  requiredAuths: string[];
  requiredPostingAuths: string[];
  /** Full standardized event, only when `standardized` is true. */
  customJson: CustomJsonEvent<T> | null;
  /** Parsed JSON payload exactly as broadcast. */
  json: unknown;
  raw: unknown;
}

/**
 * Informational origin of a payment. Never required for filtering — the engine
 * detects the protocol itself.
 */
export interface PaymentSource {
  type: "native" | "layer2";
  protocol?: string;
}

/** Normalized payment event — identical shape for native and Layer 2. */
export interface PaymentStreamEvent<T = unknown> extends ParsedPayment<T> {
  type: "payment";
  blockNumber: number;
  blockTimestamp: string;
  transactionIndex: number;
  operationIndex: number;
  source: PaymentSource;
}

export type StreamEvent<T = unknown> =
  | CustomJsonStreamEvent<T extends Record<string, unknown> ? T : Record<string, unknown>>
  | PaymentStreamEvent<T>;

export type StreamHandler<E> = (event: E) => void | Promise<void>;

/** Custom JSON filter. Every field except `handler` is optional. */
export interface CustomJsonFilter<T = Record<string, unknown>> {
  /** custom_json id, e.g. "my-game". */
  id?: string;
  /** Standardized application actions, OR-matched against the payload action. */
  actions?: string[];
  /** Only match payloads that follow the standardized protocol. */
  standardizedOnly?: boolean;
  handler: StreamHandler<CustomJsonStreamEvent<T>>;
}

/**
 * Payment filter.
 *
 * There is deliberately no `network` field: the engine detects native HIVE/HBD
 * transfers and Layer 2 token transfers automatically.
 */
export interface PaymentFilter<T = unknown> {
  from?: string;
  account?: string;
  symbol?: string;
  /** Decimal string, compared precision-safely. Never a number. */
  quantity?: string;
  /** Application actions from the standardized trigger. OR-matched, implies a trigger. */
  actions?: string[];
  /** Only match transfers carrying a valid standardized trigger. */
  requireTrigger?: boolean;
  /** Verified successful payments only. */
  handler: StreamHandler<PaymentStreamEvent<T>>;
  /** Matching payments whose Layer 2 execution failed. */
  onFailed?: StreamHandler<PaymentStreamEvent<T>>;
}

/** Returned by every filter registration: callable and `.unsubscribe()`-able. */
export type StreamSubscription = (() => void) & { unsubscribe: () => void };

/** Options for `hive.reader.stream()`. */
export interface UnifiedStreamOptions extends BlockStreamOptions {
  /**
   * How many times a pending Layer 2 execution is re-read before giving up.
   * The Hive Engine sidechain indexes a few seconds after the Hive block, so
   * live streams must wait for it. Default 6.
   */
  engineConfirmationAttempts?: number;
  /** Delay between Layer 2 execution reads, in ms. Default 2000. */
  engineConfirmationDelayMs?: number;
}
