import type { CustomJsonEvent } from "../types/index";
import type { NormalizedBlock } from "./normalizeBlock";

export type { CustomJsonEvent, NormalizedBlock };

export interface BlockStreamOptions {
  /** First block to read. Defaults to the current head block (live streaming). */
  fromBlock?: number;
  /** Abort signal used to stop the iterator cleanly. */
  signal?: AbortSignal;
  /** Poll interval in ms while waiting for new blocks. Default 3000. */
  pollIntervalMs?: number;
  /** Called on recoverable RPC errors instead of throwing. */
  onError?: (error: unknown, blockNumber: number) => void;
  /** Consecutive failures on the same block before the iterator throws. Default 5. */
  maxRetriesPerBlock?: number;
}

export interface CustomJsonStreamOptions extends BlockStreamOptions {
  /** Custom JSON id to filter by (e.g. "my-application"). */
  id: string;
  /** Optional action allow-list. */
  actions?: string[];
  /** Called when a custom_json matches the id but fails protocol validation. */
  onInvalidPayload?: (info: { reason: string; blockNumber: number; raw: unknown }) => void;
}
