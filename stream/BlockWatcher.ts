import type { BlockStreamer } from "./BlockStreamer";
import type { NormalizedBlock } from "./normalizeBlock";
import type { BlockStreamOptions } from "./types";

/**
 * `hive.blocks` — the public face of the canonical block engine.
 *
 * `watch()` is the primary block watching API. Every other watcher (Custom
 * JSON, payments) and the unified reader stream read blocks through the same
 * engine; they never open their own RPC polling loop.
 */
export class BlockWatcher {
  private readonly streamer: BlockStreamer;

  constructor(streamer: BlockStreamer) {
    this.streamer = streamer;
  }

  /**
   * Continuously read normalized blocks as an async iterator. Without
   * `fromBlock` watching starts at the current head block; with `fromBlock`
   * history is replayed and the stream continues into live blocks without a
   * gap.
   */
  watch(options: BlockStreamOptions = {}): AsyncGenerator<NormalizedBlock, void, void> {
    return this.streamer.blocks(options);
  }
}
