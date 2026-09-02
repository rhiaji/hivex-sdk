import type { CustomJsonParser } from "../parser/CustomJsonParser";
import type { EnginePaymentValidator } from "../payments/engine/EnginePaymentValidator";
import type { RpcClient } from "../rpc/RpcClient";
import { BlockStreamer } from "../stream/BlockStreamer";
import { StreamEngine } from "./stream/StreamEngine";
import type { UnifiedStreamOptions } from "./stream/types";
import { TransactionReader } from "./TransactionReader";
import type { ReadTransactionInput, TransactionResult } from "./types";

export interface ReaderClientOptions {
  rpc: RpcClient;
  parser: CustomJsonParser;
  engineValidator: EnginePaymentValidator;
}

/**
 * `hive.reader` — everything that reads the chain.
 *
 *   hive.reader.transaction(input)   read and normalize one transaction
 *   hive.reader.stream()             the unified block stream engine
 *
 * The reader owns blockchain streaming. No other namespace opens its own
 * connection: `hive.payments.watch()` is a thin adapter over this engine.
 */
export class ReaderClient {
  private readonly options: ReaderClientOptions;
  private readonly reader: TransactionReader;

  constructor(options: ReaderClientOptions) {
    this.options = options;
    this.reader = new TransactionReader(options.rpc, options.parser);
  }

  /**
   * Read one transaction by id. Returns every operation in blockchain order,
   * normalized and validated. Layer 2 payments are reported as `pending`
   * until `hive.payments.validate()` verifies sidechain execution.
   */
  transaction<T = Record<string, unknown>>(
    input: ReadTransactionInput,
  ): Promise<TransactionResult<T>> {
    return this.reader.read<T>(input);
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
