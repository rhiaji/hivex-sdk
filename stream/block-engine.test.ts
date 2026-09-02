import { describe, expect, it } from "vitest";
import type { RpcClient } from "../rpc/RpcClient";
import type { HiveBlock } from "../rpc/types";
import { HiveSdkError } from "../types/index";
import { BlockStreamer } from "./BlockStreamer";
import { normalizeBlock } from "./normalizeBlock";

function rawBlock(operations: unknown[][] = []): HiveBlock {
  return {
    block_id: "abc",
    timestamp: "2026-01-01T00:00:00",
    transaction_ids: operations.map((_, index) => `tx-${index}`),
    transactions: operations.map((ops) => ({ operations: ops })),
  } as unknown as HiveBlock;
}

interface StubOptions {
  head: number | (() => number);
  blocks?: (blockNumber: number) => HiveBlock | null;
  failBlocks?: Record<number, number>;
  failHead?: number;
}

function rpcStub(options: StubOptions) {
  const state = { headCalls: 0, blockCalls: [] as number[] };
  const failBlocks = { ...(options.failBlocks ?? {}) };
  let headFailures = options.failHead ?? 0;

  const rpc = {
    async getHeadBlockNumber() {
      state.headCalls += 1;
      if (headFailures > 0) {
        headFailures -= 1;
        throw new HiveSdkError("HTTP_ERROR", "head unavailable");
      }
      return typeof options.head === "function" ? options.head() : options.head;
    },
    async getBlock(blockNumber: number) {
      state.blockCalls.push(blockNumber);
      if (failBlocks[blockNumber]) {
        failBlocks[blockNumber] -= 1;
        throw new HiveSdkError("HTTP_ERROR", `block ${blockNumber} unavailable`);
      }
      return options.blocks ? options.blocks(blockNumber) : rawBlock();
    },
  } as unknown as RpcClient;

  return { rpc, state };
}

async function take(
  iterator: AsyncGenerator<{ blockNumber: number }, void, void>,
  count: number,
): Promise<number[]> {
  const seen: number[] = [];
  for await (const block of iterator) {
    seen.push(block.blockNumber);
    if (seen.length >= count) break;
  }
  return seen;
}

describe("normalizeBlock", () => {
  it("normalizes both RPC operation representations in chain order", () => {
    const block = normalizeBlock(100, rawBlock([
      [
        ["custom_json", { id: "a" }],
        { type: "transfer_operation", value: { from: "alice" } },
      ],
      [["transfer", { from: "bob" }]],
    ]));

    expect(block.blockNumber).toBe(100);
    expect(block.timestamp).toBe("2026-01-01T00:00:00");
    expect(block.transactions).toHaveLength(2);
    expect(block.transactions[0]?.transactionId).toBe("tx-0");
    expect(block.transactions[0]?.transactionIndex).toBe(0);
    expect(block.transactions[0]?.operations.map((op) => op.operationType)).toEqual([
      "custom_json",
      "transfer",
    ]);
    expect(block.transactions[0]?.operations.map((op) => op.operationIndex)).toEqual([0, 1]);
    expect(block.transactions[1]?.transactionIndex).toBe(1);
  });

  it("returns null transactionId when the node omits transaction_ids", () => {
    const block = normalizeBlock(1, {
      timestamp: "2026-01-01T00:00:00",
      transactions: [{ operations: [["transfer", {}]] }],
    } as unknown as HiveBlock);
    expect(block.transactions[0]?.transactionId).toBeNull();
  });
});

describe("canonical block engine", () => {
  it("streams live from the head block when fromBlock is omitted", async () => {
    let head = 500;
    const { rpc } = rpcStub({ head: () => head });
    const seen: number[] = [];

    for await (const block of new BlockStreamer(rpc).blocks({ pollIntervalMs: 1 })) {
      seen.push(block.blockNumber);
      head += 1;
      if (seen.length >= 3) break;
    }

    expect(seen).toEqual([500, 501, 502]);
  });

  it("replays history and transitions into live blocks without a gap", async () => {
    let head = 102;
    const { rpc } = rpcStub({ head: () => head });
    const streamer = new BlockStreamer(rpc);
    const seen: number[] = [];

    for await (const block of streamer.blocks({ fromBlock: 100, pollIntervalMs: 1 })) {
      seen.push(block.blockNumber);
      // The chain advances only once history has been consumed.
      if (seen.length === 3) head = 104;
      if (seen.length >= 5) break;
    }

    expect(seen).toEqual([100, 101, 102, 103, 104]);
  });

  it("waits on the same height when a block is not produced yet", async () => {
    let missingReads = 2;
    const { rpc, state } = rpcStub({
      head: 101,
      blocks: (blockNumber) => {
        if (blockNumber === 101 && missingReads > 0) {
          missingReads -= 1;
          return null;
        }
        return rawBlock();
      },
    });
    const streamer = new BlockStreamer(rpc);
    const seen: number[] = [];

    for await (const block of streamer.blocks({ fromBlock: 100, pollIntervalMs: 1 })) {
      seen.push(block.blockNumber);
      if (seen.length >= 2) break;
    }

    expect(seen).toEqual([100, 101]);
    // 101 was requested more than once and never skipped.
    expect(state.blockCalls.filter((n) => n === 101).length).toBeGreaterThan(1);
  });

  it("retries the same block on RPC failure and never skips it", async () => {
    const errors: number[] = [];
    const { rpc } = rpcStub({ head: 201, failBlocks: { 200: 2 } });
    const seen = await take(
      new BlockStreamer(rpc).blocks({
        fromBlock: 200,
        pollIntervalMs: 1,
        onError: (_error, blockNumber) => errors.push(blockNumber),
      }),
      2,
    );

    expect(errors).toEqual([200, 200]);
    expect(seen).toEqual([200, 201]);
  });

  it("throws after maxRetriesPerBlock consecutive failures on one block", async () => {
    const { rpc } = rpcStub({ head: 300, failBlocks: { 300: 99 } });
    const iterator = new BlockStreamer(rpc).blocks({
      fromBlock: 300,
      pollIntervalMs: 1,
      maxRetriesPerBlock: 2,
    });

    await expect(take(iterator, 1)).rejects.toThrow(/failed 2 times on block 300/);
  });

  it("recovers from a temporary head block failure", async () => {
    const { rpc } = rpcStub({ head: 401, failHead: 1 });
    const seen = await take(
      new BlockStreamer(rpc).blocks({ fromBlock: 400, pollIntervalMs: 1 }),
      2,
    );
    expect(seen).toEqual([400, 401]);
  });

  it("stops cleanly on abort without further RPC polling", async () => {
    const controller = new AbortController();
    let head = 600;
    const { rpc, state } = rpcStub({ head: () => head });
    const seen: number[] = [];

    for await (const block of new BlockStreamer(rpc).blocks({
      pollIntervalMs: 1,
      signal: controller.signal,
    })) {
      seen.push(block.blockNumber);
      head += 1;
      if (seen.length === 2) controller.abort();
    }

    const callsAfterAbort = state.blockCalls.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toEqual([600, 601]);
    expect(state.blockCalls.length).toBe(callsAfterAbort);
  });

  it("stops cleanly when the consumer breaks out of the loop", async () => {
    const { rpc, state } = rpcStub({ head: 700 });
    for await (const block of new BlockStreamer(rpc).blocks({ pollIntervalMs: 1 })) {
      if (block.blockNumber === 700) break;
    }
    const calls = state.blockCalls.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(state.blockCalls.length).toBe(calls);
  });
});
