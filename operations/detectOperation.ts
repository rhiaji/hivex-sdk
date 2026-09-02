import { isPlainObject } from "../utils/validation";

/**
 * Canonical operation detection.
 *
 * Hive RPC returns operations in two shapes:
 *   condenser tuple  ["transfer", { ... }]
 *   api object       { type: "transfer_operation", value: { ... } }
 *
 * Every parser in the SDK reads operations through this module. No module
 * re-implements "is this a custom_json?" or "is this a transfer?".
 */

/** An operation reduced to its canonical `{ type, value }` shape. */
export interface DetectedOperation {
  /** Operation name without the `_operation` suffix, e.g. "custom_json". */
  type: string;
  value: Record<string, unknown>;
}

/** Reduce any raw operation to `{ type, value }`, or null when unreadable. */
export function readOperation(operation: unknown): DetectedOperation | null {
  if (Array.isArray(operation)) {
    const type = operation[0];
    const value = operation[1];
    if (typeof type !== "string" || !isPlainObject(value)) return null;
    return { type: normalizeType(type), value };
  }

  if (isPlainObject(operation)) {
    const type = operation["type"];
    const value = operation["value"];
    if (typeof type !== "string" || !isPlainObject(value)) return null;
    return { type: normalizeType(type), value };
  }

  return null;
}

/**
 * Operation name only. Unlike {@link readOperation} this never requires a
 * readable body, so it is safe for indexing unknown operations.
 */
export function operationName(operation: unknown): string {
  if (Array.isArray(operation)) {
    return typeof operation[0] === "string" ? normalizeType(operation[0]) : "";
  }
  if (isPlainObject(operation)) {
    const type = operation["type"];
    return typeof type === "string" ? normalizeType(type) : "";
  }
  return "";
}

export function isCustomJsonOperation(operation: unknown): boolean {
  return operationName(operation) === "custom_json";
}

export function isTransferOperation(operation: unknown): boolean {
  return operationName(operation) === "transfer";
}

/** `*_api` reports "custom_json_operation"; the tuple form reports "custom_json". */
function normalizeType(type: string): string {
  return type.replace(/_operation$/, "");
}
