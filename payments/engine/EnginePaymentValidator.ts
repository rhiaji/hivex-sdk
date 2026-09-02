import { safeJsonParse } from "../../utils/helpers";
import { isPlainObject } from "../../utils/validation";
import type { EngineRpcClient, EngineTransactionInfo } from "./EngineRpcClient";

export interface EngineExecutionResult {
  /** null when the sidechain has not processed the transaction yet. */
  success: boolean | null;
  status: "pending" | "success" | "failed";
  /** First execution error reported by the contract, when it failed. */
  error?: string;
  info: EngineTransactionInfo | null;
}

/**
 * Answers the only question that matters for Layer 2 payments:
 * did the smart contract actually execute successfully?
 *
 * Inclusion in a Hive block only means the custom_json was broadcast. The Hive
 * Engine sidechain can still reject the action (insufficient balance, unknown
 * token, invalid quantity). Execution logs are the source of truth.
 */
export class EnginePaymentValidator {
  private readonly engineRpc: EngineRpcClient;

  constructor(engineRpc: EngineRpcClient) {
    this.engineRpc = engineRpc;
  }

  async verify(transactionId: string): Promise<EngineExecutionResult> {
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

    if (!info) return { success: null, status: "pending", info: null };
    return this.fromLogs(info);
  }

  /** Interpret the `logs` field of a sidechain transaction record. */
  fromLogs(info: EngineTransactionInfo): EngineExecutionResult {
    const parsed = safeJsonParse(typeof info.logs === "string" ? info.logs : "");
    if (!parsed.ok || !isPlainObject(parsed.value)) {
      // The transaction exists on the sidechain but carries no readable logs.
      return { success: null, status: "pending", info };
    }

    const logs = parsed.value;
    const errors = logs["errors"];
    if (Array.isArray(errors) && errors.length > 0) {
      return {
        success: false,
        status: "failed",
        error: this.describeError(errors[0]),
        info,
      };
    }

    const events = logs["events"];
    if (Array.isArray(events) && events.length > 0) {
      return { success: true, status: "success", info };
    }

    // No errors and no events: the contract produced no state change.
    return {
      success: false,
      status: "failed",
      error: "The Hive Engine contract produced no events",
      info,
    };
  }

  private describeError(error: unknown): string {
    if (typeof error === "string") return error;
    if (isPlainObject(error)) {
      const message = error["message"] ?? error["error"];
      if (typeof message === "string") return message;
    }
    return "Hive Engine execution failed";
  }
}
