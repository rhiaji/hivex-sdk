import type { CustomJsonParser } from "../parser/CustomJsonParser";
import type { EnginePaymentValidator } from "../payments/engine/EnginePaymentValidator";
import type { RpcClient } from "../rpc/RpcClient";
import { BlockStreamer } from "../stream/BlockStreamer";
import { StreamEngine } from "./stream/StreamEngine";
import type { UnifiedStreamOptions } from "./stream/types";
import { TransactionReader } from "./TransactionReader";
import type { ReadTransactionInput, TransactionReadResult } from "./types";

export interface ReaderClientOptions {
  rpc: RpcClient;
  parser: CustomJsonParser;
  engineValidator: EnginePaymentValidator;
}

/**
 * `hive.reader` — everything that reads the chain.
 *
 *   hive.reader.transaction   read one transaction by id
 *   hive.reader.stream()      the unified block stream engine
 *
 * The reader owns blockchain streaming. No other namespace opens its own
 * connection: `hive.payments.stream()` is a thin adapter over this engine.
 */
export class ReaderClient {
  /** Single-transaction reader. */
  public readonly transaction: TransactionReader;

  private readonly options: ReaderClientOptions;

  constructor(options: ReaderClientOptions) {
    this.options = options;
    this.transaction = new TransactionReader(options.rpc, options.parser);
  }

  /** Shortcut kept for backwards compatibility with `hive.reader`. */
  byTransactionId<T = Record<string, unknown>>(
    input: ReadTransactionInput,
  ): Promise<TransactionReadResult<T>> {
    return this.transaction.byTransactionId<T>(input);
  }

  /**
   * Create a unified stream: ONE block reader for Custom JSON, payments and
   * NFT actions. Register as many filters as needed on the returned engine.
   */
  stream(options: UnifiedStreamOptions = {}): StreamEngine {
    return new StreamEngine(
      {
        blocks: new BlockStreamer(this.options.rpc),
        customJsonParser: this.options.parser,
        engineValidator: this.options.engineValidator,
      },
      options,
    );
  }
}
