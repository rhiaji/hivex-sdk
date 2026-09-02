import type { CustomJsonParser } from "../../parser/CustomJsonParser";
import { enginePaymentParser } from "../../payments/engine/EnginePaymentParser";
import { hivePaymentParser } from "../../payments/hive/HivePaymentParser";
import type { ParsedPayment } from "../../payments/types";
import type { HiveOperation } from "../../rpc/types";
import { safeJsonParse } from "../../utils/helpers";
import type {
  CustomJsonStreamEvent,
  PaymentSource,
  StreamEventPosition,
} from "./types";

/**
 * Turns one raw Hive operation into the normalized candidates the stream
 * engine can dispatch. Never throws: unknown or malformed operations simply
 * produce no candidate.
 */
export class OperationParser {
  private readonly customJsonParser: CustomJsonParser;

  constructor(customJsonParser: CustomJsonParser) {
    this.customJsonParser = customJsonParser;
  }

  /** Standardized or raw custom_json, or null when the op is something else. */
  customJson(
    operation: HiveOperation,
    position: StreamEventPosition,
  ): CustomJsonStreamEvent | null {
    const extracted = this.customJsonParser.extractOperation(operation);
    if (!extracted) return null;

    const parsed = safeJsonParse(extracted.json);
    const json = parsed.ok ? parsed.value : null;

    const standard = this.customJsonParser.parseOperation(operation, {
      blockNumber: position.blockNumber,
      blockTimestamp: position.blockTimestamp,
      transactionId: position.transactionId,
      transactionIndex: position.transactionIndex,
      operationIndex: position.operationIndex,
    });

    const standardized = standard.status === "ok";
    const event = standardized ? standard.event : null;

    return {
      type: "custom_json",
      ...position,
      account:
        event?.account ??
        extracted.required_posting_auths[0] ??
        extracted.required_auths[0] ??
        null,
      id: extracted.id,
      action: event?.action ?? null,
      metadata: event?.metadata ?? null,
      standardized,
      requiredAuths: extracted.required_auths,
      requiredPostingAuths: extracted.required_posting_auths,
      customJson: event,
      json,
      raw: operation,
    };
  }

  /**
   * Native HIVE / HBD transfer or Layer 2 token transfer — detected
   * automatically, no network hint required from the caller.
   */
  payment(
    operation: unknown,
    position: StreamEventPosition,
  ): { payment: ParsedPayment; source: PaymentSource } | null {
    const context = {
      transactionId: position.transactionId,
      blockNumber: position.blockNumber,
      operationIndex: position.operationIndex,
    };

    const native = hivePaymentParser.parseOperation(operation, context);
    if (native) return { payment: native, source: { type: "native" } };

    const engine = enginePaymentParser.parseOperation(operation, context);
    if (engine) {
      return { payment: engine, source: { type: "layer2", protocol: "hive-engine" } };
    }
    return null;
  }

}
