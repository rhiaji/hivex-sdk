import type { CustomJsonParser } from "../parser/CustomJsonParser";
import type { RpcClient } from "../rpc/RpcClient";
import type { HiveOperation } from "../rpc/types";
import { HiveSdkError } from "../types/index";
import { isPlainObject } from "../utils/validation";
import type { ReadTransactionInput, TransactionReadResult } from "./types";

interface RawTransaction {
  block_num?: number;
  transaction_num?: number;
  transaction_id?: string;
  expiration?: string;
  operations?: HiveOperation[];
  [key: string]: unknown;
}

/**
 * Reads a single Hive transaction by id and normalizes any standardized
 * Custom JSON operations it contains, using the shared parser.
 */
export class TransactionReader {
  private readonly rpc: RpcClient;
  private readonly parser: CustomJsonParser;

  constructor(rpc: RpcClient, parser: CustomJsonParser) {
    this.rpc = rpc;
    this.parser = parser;
  }

  async byTransactionId<T = Record<string, unknown>>(
    input: ReadTransactionInput,
  ): Promise<TransactionReadResult<T>> {
    const transactionId = input.transactionId?.trim();
    if (!transactionId) {
      throw new HiveSdkError("VALIDATION_ERROR", `"transactionId" must be a non-empty string`);
    }

    const transaction = await this.fetchTransaction(transactionId);
    const blockNumber = typeof transaction.block_num === "number" ? transaction.block_num : 0;
    const transactionIndex =
      typeof transaction.transaction_num === "number" ? transaction.transaction_num : 0;

    const blockTimestamp = blockNumber > 0 ? await this.fetchBlockTimestamp(blockNumber) : "";

    const operations = Array.isArray(transaction.operations) ? transaction.operations : [];
    const events: TransactionReadResult<T>["events"] = [];
    const invalid: TransactionReadResult<T>["invalid"] = [];

    for (let opIndex = 0; opIndex < operations.length; opIndex += 1) {
      const operation = operations[opIndex];
      if (!operation) continue;

      const result = this.parser.parseOperation<T>(
        operation,
        {
          blockNumber,
          blockTimestamp,
          transactionId,
          transactionIndex,
          operationIndex: opIndex,
        },
        input.id === undefined ? undefined : { id: input.id },
      );

      if (result.status === "ok") events.push(result.event);
      else if (result.status === "invalid") invalid.push({ reason: result.reason, raw: result.raw });
    }

    return {
      transactionId,
      blockNumber,
      blockTimestamp,
      events,
      invalid,
      raw: transaction,
    };
  }

  /** account_history_api first, condenser_api as fallback. */
  private async fetchTransaction(transactionId: string): Promise<RawTransaction> {
    try {
      const result = await this.rpc.call<RawTransaction>("account_history_api.get_transaction", {
        id: transactionId,
        include_reversible: true,
      });
      if (isPlainObject(result)) return result;
    } catch {
      // fall through to condenser_api
    }

    try {
      const result = await this.rpc.call<RawTransaction>("condenser_api.get_transaction", [
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

  private async fetchBlockTimestamp(blockNumber: number): Promise<string> {
    try {
      const block = await this.rpc.getBlock(blockNumber);
      return typeof block?.timestamp === "string" ? block.timestamp : "";
    } catch {
      return "";
    }
  }
}
