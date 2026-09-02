import type { RpcClient } from "../rpc/RpcClient";
import type { NumberedBlock } from "../rpc/types";
import { HiveSdkError } from "../types/index";
import { sleep } from "../utils/helpers";
import type { BlockStreamOptions } from "./types";

/**
 * Sequentially reads Hive blocks and yields them as an async iterator.
 * Defaults to live streaming from the current head block — it never replays
 * the whole chain history unless `fromBlock` is provided.
 */
export class BlockStreamer {
  private readonly rpc: RpcClient;

  constructor(rpc: RpcClient) {
    this.rpc = rpc;
  }

  async *blocks(options: BlockStreamOptions = {}): AsyncGenerator<NumberedBlock, void, void> {
    const pollIntervalMs = options.pollIntervalMs ?? 3000;
    const maxRetries = options.maxRetriesPerBlock ?? 5;
    const signal = options.signal;

    let current =
      options.fromBlock ?? (await this.rpc.getHeadBlockNumber(signal ? { signal } : undefined));
    let failures = 0;

    while (!signal?.aborted) {
      let block: NumberedBlock | null = null;

      try {
        const raw = await this.rpc.getBlock(current, signal ? { signal } : undefined);
        block = raw ? { ...raw, block_num: current, blockNumber: current } : null;
        failures = 0;
      } catch (error) {
        if (signal?.aborted) return;
        failures += 1;
        options.onError?.(error, current);
        if (failures >= maxRetries) {
          throw new HiveSdkError(
            "RPC_ERROR",
            `Block stream failed ${failures} times on block ${current}`,
            error,
          );
        }
        await sleep(Math.min(pollIntervalMs * failures, 15000), signal);
        continue;
      }

      if (!block) {
        // Block not produced yet — wait and retry the same height.
        await sleep(pollIntervalMs, signal);
        continue;
      }

      yield block;
      current += 1;
    }
  }
}
