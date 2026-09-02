import type { RpcClient } from "../rpc/RpcClient";
import { HiveSdkError } from "../types/index";
import { sleep } from "../utils/helpers";
import { normalizeBlock, type NormalizedBlock } from "./normalizeBlock";
import type { BlockStreamOptions } from "./types";

/**
 * THE CANONICAL BLOCK ENGINE.
 *
 * Every blockchain watching feature in the SDK reads blocks through this one
 * implementation — `hive.blocks.watch()`, `hive.customJson.watch()`,
 * `hive.payments.watch()` and `hive.reader.stream()`. There is no second
 * polling loop, head-block tracker, block fetcher or retry loop anywhere else.
 *
 * Responsibilities: RPC communication, head block tracking, block fetching,
 * sequential ordering, historical backfill, seamless historical -> live
 * transition, poll intervals, retries, AbortSignal handling, normalization.
 *
 * Explicitly NOT its responsibility: any application logic (Custom JSON
 * filtering, payment detection, NFT rules). Those belong to consumers.
 */
export class BlockStreamer {
  private readonly rpc: RpcClient;

  constructor(rpc: RpcClient) {
    this.rpc = rpc;
  }

  /**
   * Sequential, gap-free async iterator of normalized blocks.
   *
   * A single `nextBlock` cursor drives both history and live blocks, so there
   * is no "read history, then start polling" hand-off that could skip blocks.
   * The cursor only advances after a block has been yielded.
   */
  async *blocks(options: BlockStreamOptions = {}): AsyncGenerator<NormalizedBlock, void, void> {
    const pollIntervalMs = options.pollIntervalMs ?? 3000;
    const maxRetries = Math.max(1, options.maxRetriesPerBlock ?? 5);
    const signal = options.signal;
    const rpcOptions = signal ? { signal } : undefined;

    let nextBlock = options.fromBlock ?? null;
    let head: number | null = null;
    let failures = 0;

    while (!signal?.aborted) {
      // Head block tracking lives here and nowhere else.
      if (head === null || (nextBlock !== null && nextBlock > head)) {
        try {
          head = await this.rpc.getHeadBlockNumber(rpcOptions);
          failures = 0;
        } catch (error) {
          if (signal?.aborted) return;
          failures += 1;
          options.onError?.(error, nextBlock ?? 0);
          if (failures >= maxRetries) {
            throw new HiveSdkError(
              "RPC_ERROR",
              `Block stream failed ${failures} times reading the head block`,
              error,
            );
          }
          await sleep(backoff(pollIntervalMs, failures), signal);
          continue;
        }
      }

      // Without `fromBlock` the stream is live: start at the current head.
      if (nextBlock === null) nextBlock = head;

      if (nextBlock > head) {
        // Caught up with the chain — wait, then re-read the head block.
        await sleep(pollIntervalMs, signal);
        continue;
      }

      try {
        const raw = await this.rpc.getBlock(nextBlock, rpcOptions);
        if (!raw) {
          // Not available on this node yet. Never advance the cursor.
          await sleep(pollIntervalMs, signal);
          continue;
        }
        failures = 0;
        yield normalizeBlock(nextBlock, raw);
        nextBlock += 1;
      } catch (error) {
        if (signal?.aborted) return;
        failures += 1;
        options.onError?.(error, nextBlock);
        if (failures >= maxRetries) {
          throw new HiveSdkError(
            "RPC_ERROR",
            `Block stream failed ${failures} times on block ${nextBlock}`,
            error,
          );
        }
        // Retry the same height: a failed read must never skip a block.
        await sleep(backoff(pollIntervalMs, failures), signal);
      }
    }
  }
}

function backoff(pollIntervalMs: number, failures: number): number {
  return Math.min(pollIntervalMs * failures, 15000);
}
