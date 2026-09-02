import type { RpcClient } from "../rpc/RpcClient";
import type { HiveOperation } from "../rpc/types";
import { HiveSdkError } from "../types/index";
import { isPlainObject } from "../utils/validation";

/** Raw Hive transaction as returned by the node. */
export interface RawHiveTransaction {
  block_num?: number;
  transaction_num?: number;
  transaction_id?: string;
  expiration?: string;
  operations?: HiveOperation[];
  [key: string]: unknown;
}

/**
 * THE canonical single-transaction lookup.
 *
 * `account_history_api.get_transaction` first, `condenser_api.get_transaction`
 * as fallback. No other module talks to the node to fetch a transaction.
 */
export async function fetchRawTransaction(
  rpc: RpcClient,
  transactionId: string,
): Promise<RawHiveTransaction> {
  try {
    const result = await rpc.call<RawHiveTransaction>("account_history_api.get_transaction", {
      id: transactionId,
      include_reversible: true,
    });
    if (isPlainObject(result)) return result;
  } catch {
    // fall through to condenser_api
  }

  try {
    const result = await rpc.call<RawHiveTransaction>("condenser_api.get_transaction", [
      transactionId,
    ]);
    if (isPlainObject(result)) return result;
  } catch (error) {
    throw new HiveSdkError(
      "NOT_FOUND",
      `Transaction ${transactionId} could not be read from the endpoint`,
      error,
    );
  }

  throw new HiveSdkError("NOT_FOUND", `Transaction ${transactionId} was not found`);
}
