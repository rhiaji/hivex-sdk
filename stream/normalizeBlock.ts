import { operationName } from "../operations/detectOperation";
import type { HiveBlock, HiveOperation } from "../rpc/types";

/**
 * Normalization layer of the canonical block engine.
 *
 * Hive RPC APIs expose blocks inconsistently (`condenser_api` tuples vs
 * `*_api` objects, `transaction_ids` sometimes missing). Consumers must never
 * deal with that: every filter, parser and watcher reads the normalized shape
 * produced here.
 */

/** One operation with its deterministic position inside the transaction. */
export interface NormalizedOperation {
  /** Position of the operation inside its transaction. */
  operationIndex: number;
  /** Operation name, e.g. "custom_json" or "transfer". */
  operationType: string;
  /** Operation exactly as broadcast, for parsers that need the raw payload. */
  operation: HiveOperation;
}

/** One transaction with its deterministic position inside the block. */
export interface NormalizedTransaction {
  /** Transaction id, or null when the node did not include it. */
  transactionId: string | null;
  /** Position of the transaction inside the block. */
  transactionIndex: number;
  operations: NormalizedOperation[];
}

/** Canonical block shape yielded by the block engine. */
export interface NormalizedBlock {
  blockNumber: number;
  blockId: string | null;
  /** Block timestamp as reported by the chain, or "" when absent. */
  timestamp: string;
  transactions: NormalizedTransaction[];
  /** Block exactly as returned by the RPC node. */
  raw: HiveBlock;
}

/** Read an operation name from either RPC representation. */
export function operationType(operation: HiveOperation): string {
  return operationName(operation);
}

/**
 * Turn a raw RPC block into the canonical normalized shape, preserving
 * blockchain order: transaction index, then operation index.
 */
export function normalizeBlock(blockNumber: number, raw: HiveBlock): NormalizedBlock {
  const rawTransactions = Array.isArray(raw.transactions) ? raw.transactions : [];
  const transactionIds = Array.isArray(raw.transaction_ids) ? raw.transaction_ids : [];

  const transactions: NormalizedTransaction[] = rawTransactions.map(
    (transaction, transactionIndex) => {
      const rawOperations = Array.isArray(transaction?.operations) ? transaction.operations : [];
      const operations: NormalizedOperation[] = [];

      for (let operationIndex = 0; operationIndex < rawOperations.length; operationIndex += 1) {
        const operation = rawOperations[operationIndex];
        if (!operation) continue;
        operations.push({
          operationIndex,
          operationType: operationType(operation),
          operation,
        });
      }

      const id = transactionIds[transactionIndex];
      return {
        transactionId: typeof id === "string" && id !== "" ? id : null,
        transactionIndex,
        operations,
      };
    },
  );

  return {
    blockNumber,
    blockId: typeof raw.block_id === "string" ? raw.block_id : null,
    timestamp: typeof raw.timestamp === "string" ? raw.timestamp : "",
    transactions,
    raw,
  };
}
