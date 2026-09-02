import type { IssuerContext } from "../issuer/IssuerDispatcher";
import type { RpcClient } from "../rpc/RpcClient";
import { EnginePaymentClient } from "./engine/EnginePaymentClient";
import { EnginePaymentValidator } from "./engine/EnginePaymentValidator";
import { EngineRpcClient, type EngineRpcOptions } from "./engine/EngineRpcClient";
import { HivePaymentClient } from "./hive/HivePaymentClient";
import { TransactionReader } from "../reader/TransactionReader";
import { CustomJsonParser } from "../parser/CustomJsonParser";
import { ReaderClient } from "../reader/ReaderClient";
import { PaymentWatcher, type StreamEngineFactory } from "./PaymentWatcher";
import { PaymentValidator } from "./PaymentValidator";
import type {
  ParsedPayment,
  PaymentStreamOptions,
  PaymentValidateInput,
  PaymentValidationResult,
} from "./types";

export interface PaymentClientOptions {
  rpc: RpcClient;
  issuer: IssuerContext;
  engine?: EngineRpcOptions;
  /** Injected sidechain validator — shared with the unified stream engine. */
  engineValidator?: EnginePaymentValidator;
  /**
   * Factory for the unified stream engine. Payments never open their own
   * blockchain connection: `stream()` and `watch()` are adapters over it.
   */
  createStream?: StreamEngineFactory;
}

/**
 * `hive.payments` — one namespace for both networks.
 *
 *   hive.payments.hive    native HIVE / HBD transfers with triggers
 *   hive.payments.engine  Hive Engine token transfers with triggers
 *   hive.payments.parse / validate / watch
 *
 * Stateless by design: idempotency is the application's responsibility, keyed
 * on `transactionId` (plus `operationIndex` when a transaction carries several
 * payments).
 */
export class PaymentClient {
  /** Native HIVE / HBD payments. */
  public readonly hive: HivePaymentClient;
  /** Hive Engine (Layer 2) payments. */
  public readonly engine: EnginePaymentClient;
  /** Direct access to the Hive Engine sidechain RPC. */
  public readonly engineRpc: EngineRpcClient;

  private readonly reader: TransactionReader;
  private readonly validator: PaymentValidator;
  private readonly watcher: PaymentWatcher;

  constructor(options: PaymentClientOptions) {
    this.hive = new HivePaymentClient(options.issuer);
    this.engine = new EnginePaymentClient(options.issuer);
    this.engineRpc = new EngineRpcClient(options.engine ?? {});

    const engineValidator = options.engineValidator ?? new EnginePaymentValidator(this.engineRpc);
    this.reader = new TransactionReader(options.rpc, new CustomJsonParser());
    this.validator = new PaymentValidator(this.reader, engineValidator);

    const createStream =
      options.createStream ??
      ((streamOptions) =>
        new ReaderClient({
          rpc: options.rpc,
          parser: new CustomJsonParser(),
          engineValidator,
        }).stream(streamOptions));
    this.watcher = new PaymentWatcher(createStream);
  }

  /** Every payment carried by a transaction, without execution checks. */
  async parse<T = unknown>(input: { transactionId: string }): Promise<ParsedPayment<T>[]> {
    return this.validator.parse<T>(input.transactionId);
  }

  /**
   * Verify a payment: it exists, it executed (Layer 2 included) and it matches
   * the expected sender, recipient, amount and action.
   */
  async validate<T = unknown>(
    input: PaymentValidateInput,
  ): Promise<PaymentValidationResult<T>> {
    return this.validator.validate<T>(input);
  }

  /**
   * Async iterator over live payments — a filtered view of the core block
   * stream, never a second blockchain connection.
   */
  watch<T = unknown>(
    options: PaymentStreamOptions<T> = {},
  ): AsyncGenerator<ParsedPayment<T>, void, void> {
    return this.watcher.watch<T>(options);
  }
}
