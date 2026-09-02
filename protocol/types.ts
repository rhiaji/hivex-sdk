/**
 * The shared standardized action payload used by every transport of the SDK:
 * Custom JSON operations, native Hive transfer memos and Layer 2 transfer
 * memos. One payload shape, many transports.
 *
 * No timestamps: the blockchain is the authoritative clock.
 */

/** Normalized payload. `metadata` is always present, possibly null. */
export interface ActionPayload<T = Record<string, unknown>> {
  action: string;
  metadata: T | null;
}

/** Developer-facing input; metadata may be omitted and defaults to null. */
export interface ActionPayloadInput<T = Record<string, unknown>> {
  action: string;
  metadata?: T | null;
}
