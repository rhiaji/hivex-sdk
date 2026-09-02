import type { NumberedBlock } from "../rpc/types";
import type { BlockStreamer } from "./BlockStreamer";
import type { BlockStreamOptions } from "./types";

/**
 * `hive.blocks` — the core blockchain reading foundation.
 *
 * Every other watcher (Custom JSON, payments) and the unified stream engine
 * read blocks through this single block stream. They never open their own
 * RPC polling loop.
 */
export class BlockWatcher {
  private readonly streamer: BlockStreamer;

  constructor(streamer: BlockStreamer) {
    this.streamer = streamer;
  }

  /**
   * Continuously read raw blocks as an async iterator. Without `fromBlock`
   * watching starts at the current head block.
   */
  watch(options: BlockStreamOptions = {}): AsyncGenerator<NumberedBlock, void, void> {
    return this.streamer.blocks(options);
  }
}
