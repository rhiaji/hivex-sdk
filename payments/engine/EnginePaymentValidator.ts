import { safeJsonParse } from "../../utils/helpers";
import { isPlainObject } from "../../utils/validation";
import { quantitiesEqual } from "../amount";
import type { EngineRpcClient, EngineTransactionInfo } from "./EngineRpcClient";

export interface EngineExecutionResult {
  /** null when the sidechain has not (yet) resolved the transaction. */
  success: boolean | null;
  status: "pending" | "success" | "failed";
  /** Execution error, or the reason the result is still pending. */
  error?: string;
  info: EngineTransactionInfo | null;
}

/**
 * Which transfer inside the transaction we want the verdict for. Supplying it
 * prevents a different transfer in the SAME transaction from being credited.
 */
export interface EngineExecutionExpectation {
  from?: string;
  to?: string;
  symbol?: string;
  quantity?: string;
}

/**
 * THE Layer 2 execution validator.
 *
 * Answers the only question that matters for Layer 2 payments: did the smart
 * contract actually execute successfully?
 *
 * Inclusion in a Hive block only means the custom_json was broadcast. The Hive
 * Engine sidechain can still reject the action (insufficient balance, unknown
 * token, invalid quantity). Execution logs are the source of truth, and the
 * SDK never reports success it could not verify.
 */
export class EnginePaymentValidator {
  private readonly engineRpc: EngineRpcClient;

  constructor(engineRpc: EngineRpcClient) {
    this.engineRpc = engineRpc;
  }

  async verify(
    transactionId: string,
    expected?: EngineExecutionExpectation,
  ): Promise<EngineExecutionResult> {
    let info: EngineTransactionInfo | null = null;
    try {
      info = await this.engineRpc.getTransactionInfo(transactionId);
    } catch (error) {
      return {
        success: null,
        status: "pending",
        error: (error as Error)?.message ?? "Hive Engine execution could not be read",
        info: null,
      };
    }

    if (!info) {
      return {
        success: null,
        status: "pending",
        error: "The Hive Engine sidechain has not indexed this transaction yet",
        info: null,
      };
    }
    return this.fromLogs(info, expected);
  }

  /** Interpret the `logs` field of a sidechain transaction record. */
  fromLogs(
    info: EngineTransactionInfo,
    expected?: EngineExecutionExpectation,
  ): EngineExecutionResult {
    const parsed = safeJsonParse(typeof info.logs === "string" ? info.logs : "");
    if (!parsed.ok || !isPlainObject(parsed.value)) {
      // The transaction exists on the sidechain but carries no readable logs.
      return {
        success: null,
        status: "pending",
        error: "Hive Engine execution logs are not readable yet",
        info,
      };
    }

    const logs = parsed.value;
    const errors = logs["errors"];
    if (Array.isArray(errors) && errors.length > 0) {
      return { success: false, status: "failed", error: describeError(errors[0]), info };
    }

    const events = Array.isArray(logs["events"]) ? logs["events"] : [];
    if (events.length === 0) {
      // No errors and no events: the contract produced no state change.
      return {
        success: false,
        status: "failed",
        error: "The Hive Engine contract produced no events",
        info,
      };
    }

    if (!expected) return { success: true, status: "success", info };

    // Precise matching: a transaction can carry several transfers, so the
    // verdict must come from the event describing THIS transfer.
    const transfers = events.filter((event) => isTransferEvent(event));
    if (transfers.length === 0) return { success: true, status: "success", info };

    const matched = transfers.some((event) => matchesExpectation(event, expected));
    if (matched) return { success: true, status: "success", info };

    return {
      success: false,
      status: "failed",
      error: "No Hive Engine transfer event matched this operation",
      info,
    };
  }
}

function isTransferEvent(event: unknown): event is Record<string, unknown> {
  return isPlainObject(event) && event["event"] === "transfer" && isPlainObject(event["data"]);
}

function matchesExpectation(
  event: Record<string, unknown>,
  expected: EngineExecutionExpectation,
): boolean {
  const data = event["data"] as Record<string, unknown>;
  if (expected.from !== undefined && data["from"] !== expected.from) return false;
  if (expected.to !== undefined && data["to"] !== expected.to) return false;
  if (expected.symbol !== undefined && data["symbol"] !== expected.symbol) return false;
  if (expected.quantity !== undefined) {
    const quantity = data["quantity"];
    if (typeof quantity !== "string" && typeof quantity !== "number") return false;
    if (!quantitiesEqual(expected.quantity, String(quantity))) return false;
  }
  return true;
}

function describeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (isPlainObject(error)) {
    const message = error["message"] ?? error["error"];
    if (typeof message === "string") return message;
  }
  return "Hive Engine execution failed";
}
