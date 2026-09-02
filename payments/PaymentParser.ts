import type { RpcClient } from "../rpc/RpcClient";
import { HiveSdkError } from "../types/index";
import { isPlainObject } from "../utils/validation";
import { enginePaymentParser } from "./engine/EnginePaymentParser";
import { hivePaymentParser } from "./hive/HivePaymentParser";
import type { ParsedPayment } from "./types";

interface RawTransaction {
  block_num?: number;
  transaction_id?: string;
  operations?: unknown[];
  [key: string]: unknown;
}

/**
 * Reads every payment carried by a broadcast transaction, native and Layer 2.
 * Execution status is NOT resolved here — see `PaymentValidator`.
 */
export class PaymentParser {
  private readonly rpc: RpcClient;

  constructor(rpc: RpcClient) {
    this.rpc = rpc;
  }

  /** All payments found in a transaction, in operation order. */
  async parseTransaction<T = unknown>(transactionId: string): Promise<ParsedPayment<T>[]> {
    if (typeof transactionId !== "string" || transactionId.trim() === "") {
      throw new HiveSdkError("VALIDATION_ERROR", `"transactionId" must be a non-empty string`);
    }

    const transaction = await this.fetchTransaction(transactionId);
    const operations = Array.isArray(transaction.operations) ? transaction.operations : [];
    const blockNumber =
      typeof transaction.block_num === "number" ? transaction.block_num : undefined;

    const payments: ParsedPayment<T>[] = [];
    operations.forEach((operation, operationIndex) => {
      const context = {
        transactionId,
        ...(blockNumber !== undefined ? { blockNumber } : {}),
        operationIndex,
      };
      // The protocol is detected automatically — callers never pass a network.
      const parsed =
        hivePaymentParser.parseOperation<T>(operation, context) ??
        enginePaymentParser.parseOperation<T>(operation, context);
      if (parsed) payments.push(parsed);
    });

    return payments;
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
}
