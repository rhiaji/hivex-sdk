import type { TransactionReader } from "../reader/TransactionReader";
import { HiveSdkError } from "../types/index";
import { quantitiesEqual } from "./amount";
import type { EnginePaymentValidator } from "./engine/EnginePaymentValidator";
import type {
  ParsedPayment,
  PaymentExpectation,
  PaymentValidateInput,
  PaymentValidationResult,
} from "./types";

/**
 * THE payment validator.
 *
 * Verifies that a payment happened, executed and matches expectations. It
 * reuses the canonical transaction reader — it never fetches or parses a
 * transaction itself.
 *
 * Native transfers are final once included in a block. Layer 2 transfers are
 * only successful when the Hive Engine execution logs say so; an unresolved
 * sidechain stays `pending`, never a false success and never a false failure.
 */
export class PaymentValidator {
  private readonly reader: TransactionReader;
  private readonly engineValidator: EnginePaymentValidator;

  constructor(reader: TransactionReader, engineValidator: EnginePaymentValidator) {
    this.reader = reader;
    this.engineValidator = engineValidator;
  }

  /** Every payment carried by a transaction, without execution checks. */
  async parse<T = unknown>(transactionId: string): Promise<ParsedPayment<T>[]> {
    if (typeof transactionId !== "string" || transactionId.trim() === "") {
      throw new HiveSdkError("VALIDATION_ERROR", `"transactionId" must be a non-empty string`);
    }
    const result = await this.reader.read<T extends Record<string, unknown> ? T : never>({
      transactionId,
    });
    return result.payments as unknown as ParsedPayment<T>[];
  }

  async validate<T = unknown>(
    input: PaymentValidateInput,
  ): Promise<PaymentValidationResult<T>> {
    if (!input || typeof input.transactionId !== "string" || input.transactionId.trim() === "") {
      throw new HiveSdkError("VALIDATION_ERROR", `"transactionId" must be a non-empty string`);
    }

    let payments: ParsedPayment<T>[] = [];
    try {
      payments = await this.parse<T>(input.transactionId);
    } catch (error) {
      if (error instanceof HiveSdkError && error.code === "NOT_FOUND") {
        return this.notFound<T>(input);
      }
      throw error;
    }

    // The transaction exists but carries no supported payment operation.
    if (payments.length === 0) return this.unsupported<T>(input);

    const payment = this.selectPayment(payments, input.expected);
    const resolved = await this.resolveExecution<T>(payment);

    if (resolved.success !== true) return resolved;

    const mismatch = this.findMismatch(resolved, input.expected);
    if (mismatch) {
      return { ...resolved, success: false, status: "invalid", error: mismatch };
    }

    return resolved;
  }

  /** Resolve Layer 2 execution; native payments are already final. */
  private async resolveExecution<T>(payment: ParsedPayment<T>): Promise<ParsedPayment<T>> {
    if (payment.network !== "engine" || !payment.transactionId) return payment;

    // Matching is as precise as the sidechain data allows, so another transfer
    // in the same transaction can never be credited to this one.
    const execution = await this.engineValidator.verify(payment.transactionId, {
      from: payment.transfer.from,
      to: payment.transfer.account,
      symbol: payment.transfer.symbol,
      quantity: payment.transfer.quantity,
    });

    return {
      ...payment,
      success: execution.success,
      status: execution.status,
      ...(execution.error ? { error: execution.error } : {}),
    };
  }

  /** Prefer the operation matching the expectations; otherwise the first one. */
  private selectPayment<T>(
    payments: ParsedPayment<T>[],
    expected?: PaymentExpectation,
  ): ParsedPayment<T> {
    if (!expected) return payments[0] as ParsedPayment<T>;
    const match = payments.find((payment) => this.findMismatch(payment, expected) === null);
    return (match ?? payments[0]) as ParsedPayment<T>;
  }

  /** First expectation that does not hold, or null when everything matches. */
  private findMismatch(payment: ParsedPayment, expected?: PaymentExpectation): string | null {
    if (!expected) return null;
    const { transfer, trigger } = payment;

    if (expected.from !== undefined && expected.from !== transfer.from) {
      return `Expected sender "${expected.from}" but the transfer came from "${transfer.from}"`;
    }
    if (expected.account !== undefined && expected.account !== transfer.account) {
      return `Expected recipient "${expected.account}" but the transfer went to "${transfer.account}"`;
    }
    if (expected.symbol !== undefined && expected.symbol !== transfer.symbol) {
      return `Expected symbol "${expected.symbol}" but the transfer used "${transfer.symbol}"`;
    }
    if (expected.quantity !== undefined && !quantitiesEqual(expected.quantity, transfer.quantity)) {
      return `Expected quantity "${expected.quantity}" but the transfer carried "${transfer.quantity}"`;
    }
    if (expected.action !== undefined && trigger?.action !== expected.action) {
      return trigger
        ? `Expected action "${expected.action}" but the trigger carried "${trigger.action}"`
        : `Expected action "${expected.action}" but the payment carried no standardized trigger`;
    }
    return null;
  }

  private notFound<T>(input: PaymentValidateInput): PaymentValidationResult<T> {
    return {
      network: "hive",
      transactionId: input.transactionId,
      success: false,
      status: "not_found",
      transfer: { from: "", account: "", symbol: "", quantity: "0" },
      trigger: null,
      error: `Transaction ${input.transactionId} was not found`,
    };
  }

  private unsupported<T>(input: PaymentValidateInput): PaymentValidationResult<T> {
    return {
      network: "hive",
      transactionId: input.transactionId,
      success: false,
      status: "invalid",
      transfer: { from: "", account: "", symbol: "", quantity: "0" },
      trigger: null,
      error: `Transaction ${input.transactionId} carries no supported payment operation`,
    };
  }
}
