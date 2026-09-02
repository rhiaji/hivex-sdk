import { actionPayloadParser, type ActionPayloadParseResult } from "../protocol/index";
import type { PaymentTrigger } from "./types";

/**
 * THE canonical payment-trigger module.
 *
 * A payment trigger is the standardized `{ action, metadata }` payload that
 * tells the application WHY a payment happened. There is exactly one parser
 * and one association rule; `payments.watch()`, `reader.stream()`, the
 * transaction reader and `payments.validate()` all use this module.
 */

/** A standardized Custom JSON operation that can act as a trigger. */
export interface TriggerCandidate<T = unknown> {
  /** Position of the custom_json operation inside its transaction. */
  operationIndex: number;
  /** Signing account of the custom_json operation. */
  account: string | null;
  payload: PaymentTrigger<T>;
}

/** Where the associated trigger came from. */
export type TriggerSource = "memo" | "custom_json" | null;

export interface AssociatedTrigger<T = unknown> {
  trigger: PaymentTrigger<T> | null;
  source: TriggerSource;
}

/**
 * Parse a transfer memo into a trigger, with a failure reason.
 * Malformed memos are NEVER an error: they simply are not triggers.
 */
export function parseTriggerMemo<T = unknown>(
  memo: unknown,
): ActionPayloadParseResult<T> {
  return actionPayloadParser.parseResult<T>(memo);
}

/** Convenience: the trigger carried by a memo, or null. */
export function triggerFromMemo<T = unknown>(memo: unknown): PaymentTrigger<T> | null {
  const result = parseTriggerMemo<T>(memo);
  return result.valid ? result.value : null;
}

/**
 * THE trigger association rule.
 *
 * 1. Memo trigger wins. A valid `{ action, metadata }` payload inside the
 *    transfer memo is unambiguous and is always preferred.
 * 2. Otherwise the trigger is the NEAREST standardized custom_json operation
 *    that appears BEFORE the payment IN THE SAME TRANSACTION and is signed by
 *    the payment sender.
 * 3. Otherwise there is no trigger.
 *
 * Association never crosses a transaction boundary and never looks at other
 * operations in the block: two unrelated operations that merely share a block
 * are never associated.
 */
export function associateTrigger<T = unknown>(
  payment: { operationIndex: number | undefined; from: string; memoTrigger: PaymentTrigger<T> | null },
  candidates: TriggerCandidate<T>[],
): AssociatedTrigger<T> {
  if (payment.memoTrigger) return { trigger: payment.memoTrigger, source: "memo" };

  const operationIndex = payment.operationIndex ?? Number.MAX_SAFE_INTEGER;
  let best: TriggerCandidate<T> | null = null;

  for (const candidate of candidates) {
    if (candidate.operationIndex >= operationIndex) continue;
    if (candidate.account !== null && candidate.account !== payment.from) continue;
    if (!best || candidate.operationIndex > best.operationIndex) best = candidate;
  }

  return best ? { trigger: best.payload, source: "custom_json" } : { trigger: null, source: null };
}
