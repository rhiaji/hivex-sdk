import { describe, expect, it } from "vitest";
import { CustomJsonParser } from "../parser/CustomJsonParser";
import type { EnginePaymentValidator } from "../payments/engine/EnginePaymentValidator";
import { PaymentWatcher } from "../payments/PaymentWatcher";
import { StreamEngine } from "../reader/stream/StreamEngine";
import type { UnifiedStreamOptions } from "../reader/stream/types";
import type { BlockStreamer } from "./BlockStreamer";
import { CustomJsonWatcher } from "./CustomJsonWatcher";
import { normalizeBlock, type NormalizedBlock } from "./normalizeBlock";

function customJson(id: string, json: unknown) {
  return [
    "custom_json",
    {
      required_auths: [],
      required_posting_auths: ["alice"],
      id,
      json: typeof json === "string" ? json : JSON.stringify(json),
    },
  ];
}

function transfer(memo: string) {
  return ["transfer", { from: "alice", to: "shop", amount: "5.000 HIVE", memo }];
}

function block(blockNumber: number, operations: unknown[][]): NormalizedBlock {
  return normalizeBlock(blockNumber, {
    timestamp: "2026-01-01T00:00:00",
    transaction_ids: operations.map((_, index) => `tx${blockNumber}-${index}`),
    transactions: operations.map((operation) => ({ operations: [operation] })),
  } as never);
}

/** Drain a watcher that is expected to emit nothing, stopping it via abort. */
async function collectNone<T>(
  create: (signal: AbortSignal) => AsyncGenerator<T, void, void>,
): Promise<T[]> {
  const controller = new AbortController();
  const items: T[] = [];
  setTimeout(() => controller.abort(), 60);
  for await (const item of create(controller.signal)) {
    items.push(item);
  }
  return items;
}

/** The one canonical block engine, stubbed, counting how often it is opened. */
function blockStub(blocks: NormalizedBlock[]) {
  const state = { connections: 0 };
  const streamer = {
    async *blocks(options: { signal?: AbortSignal } = {}) {
      state.connections += 1;
      for (const item of blocks) {
        if (options.signal?.aborted) return;
        yield item;
      }
      while (!options.signal?.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    },
  } as unknown as BlockStreamer;
  return { streamer, state };
}

function factory(blocks: NormalizedBlock[]) {
  const { streamer, state } = blockStub(blocks);
  const validator = {
    verify: async () => ({ success: true, status: "success", info: null }),
  } as unknown as EnginePaymentValidator;

  const createEngine = (options: UnifiedStreamOptions) =>
    new StreamEngine(
      { blocks: streamer, customJsonParser: new CustomJsonParser(), engineValidator: validator },
      { ...options, pollIntervalMs: 1 },
    );

  return { createEngine, state, validator };
}

async function collect<T>(
  iterator: AsyncGenerator<T, void, void>,
  count: number,
  timeoutMs = 500,
): Promise<T[]> {
  const items: T[] = [];
  const started = Date.now();
  for await (const item of iterator) {
    items.push(item);
    if (items.length >= count || Date.now() - started > timeoutMs) break;
  }
  return items;
}

describe("hive.customJson.watch()", () => {
  it("filters by id and consumes exactly one block engine loop", async () => {
    const { createEngine, state } = factory([
      block(1, [customJson("my_app", { action: "claim", metadata: null })]),
      block(2, [customJson("other_app", { action: "claim", metadata: null })]),
      block(3, [customJson("my_app", { action: "purchase", metadata: { id: 1 } })]),
    ]);
    const watcher = new CustomJsonWatcher(new CustomJsonParser(), createEngine);

    const events = await collect(watcher.watch({ id: "my_app" }), 2);

    expect(events.map((event) => event.action)).toEqual(["claim", "purchase"]);
    expect(events[0]?.metadata).toBeNull();
    expect(events[1]?.metadata).toEqual({ id: 1 });
    expect(state.connections).toBe(1);
  });

  it("OR-matches the actions array and ignores other actions", async () => {
    const { createEngine } = factory([
      block(1, [customJson("my_app", { action: "claim", metadata: null })]),
      block(2, [customJson("my_app", { action: "ignored", metadata: null })]),
      block(3, [customJson("my_app", { action: "purchase", metadata: null })]),
    ]);
    const watcher = new CustomJsonWatcher(new CustomJsonParser(), createEngine);

    const events = await collect(watcher.watch({ id: "my_app", actions: ["claim", "purchase"] }), 2);

    expect(events.map((event) => event.action)).toEqual(["claim", "purchase"]);
  });

  it("reports invalid payloads without terminating the stream", async () => {
    const invalid: string[] = [];
    const { createEngine } = factory([
      block(1, [customJson("my_app", "{ not json")]),
      block(2, [customJson("my_app", { wrong: "structure" })]),
      block(3, [customJson("my_app", { action: "claim", metadata: null })]),
    ]);
    const watcher = new CustomJsonWatcher(new CustomJsonParser(), createEngine);

    const events = await collect(
      watcher.watch({
        id: "my_app",
        onInvalidPayload: (info) => invalid.push(`${info.blockNumber}`),
      }),
      1,
    );

    expect(events.map((event) => event.action)).toEqual(["claim"]);
    expect(invalid.length).toBeGreaterThan(0);
  });

  it("preserves blockchain position data for idempotency", async () => {
    const { createEngine } = factory([
      block(7, [customJson("my_app", { action: "claim", metadata: null })]),
    ]);
    const watcher = new CustomJsonWatcher(new CustomJsonParser(), createEngine);

    const [event] = await collect(watcher.watch({ id: "my_app" }), 1);

    expect(event?.blockNumber).toBe(7);
    expect(event?.transactionId).toBe("tx7-0");
    expect(event?.transactionIndex).toBe(0);
    expect(event?.operationIndex).toBe(0);
    expect(event?.blockTimestamp).toBe("2026-01-01T00:00:00");
  });
});

describe("hive.payments.watch()", () => {
  it("detects native payments with a standardized trigger on one engine loop", async () => {
    const { createEngine, state } = factory([
      block(10, [transfer(JSON.stringify({ action: "purchase", metadata: { sku: "x" } }))]),
    ]);
    const watcher = new PaymentWatcher(createEngine);

    const [payment] = await collect(
      watcher.watch({ filters: { account: "shop", actions: ["purchase"] } }),
      1,
    );

    expect(payment?.transfer.from).toBe("alice");
    expect(payment?.trigger?.action).toBe("purchase");
    expect(payment?.blockNumber).toBe(10);
    expect(state.connections).toBe(1);
  });

  it("skips transfers whose trigger action is not in the actions array", async () => {
    const { createEngine } = factory([
      block(11, [transfer(JSON.stringify({ action: "donation", metadata: null }))]),
    ]);
    const watcher = new PaymentWatcher(createEngine);

    const events = await collectNone((signal) =>
      watcher.watch({ signal, filters: { actions: ["purchase"] } }),
    );

    expect(events).toEqual([]);
  });

  it("requireTrigger drops plain memo transfers", async () => {
    const { createEngine } = factory([block(12, [transfer("thanks!")])]);
    const watcher = new PaymentWatcher(createEngine);

    const events = await collectNone((signal) =>
      watcher.watch({ signal, filters: { requireTrigger: true } }),
    );

    expect(events).toEqual([]);
  });
});
