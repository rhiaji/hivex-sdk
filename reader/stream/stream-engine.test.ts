import { describe, expect, it } from "vitest";
import { CustomJsonParser } from "../../parser/CustomJsonParser";
import type { EnginePaymentValidator } from "../../payments/engine/EnginePaymentValidator";
import { HIVE_ENGINE_CUSTOM_JSON_ID } from "../../engine/constants";
import type { BlockStreamer } from "../../stream/BlockStreamer";
import { normalizeBlock, type NormalizedBlock } from "../../stream/normalizeBlock";
import { StreamEngine } from "./StreamEngine";
import type { CustomJsonStreamEvent, PaymentStreamEvent } from "./types";

const trigger = (action: string, metadata: unknown = null) =>
  JSON.stringify({ action, metadata });

function transfer(overrides: Partial<Record<string, unknown>> = {}) {
  return [
    "transfer",
    {
      from: "alice",
      to: "shop",
      amount: "10.000 HIVE",
      memo: trigger("purchase", { orderId: "A-1" }),
      ...overrides,
    },
  ];
}

function engineTransfer(memo = trigger("purchase")) {
  return [
    "custom_json",
    {
      required_auths: ["alice"],
      required_posting_auths: [],
      id: HIVE_ENGINE_CUSTOM_JSON_ID,
      json: JSON.stringify({
        contractName: "tokens",
        contractAction: "transfer",
        contractPayload: { symbol: "BEE", to: "shop", quantity: "5", memo },
      }),
    },
  ];
}

function appCustomJson(action: string) {
  return [
    "custom_json",
    {
      required_auths: [],
      required_posting_auths: ["alice"],
      id: "my_app",
      json: JSON.stringify({ action, metadata: { level: 3 } }),
    },
  ];
}

function block(blockNumber: number, operations: unknown[][]): NormalizedBlock {
  return normalizeBlock(blockNumber, {
    timestamp: "2026-01-01T00:00:00",
    transaction_ids: operations.map((_, index) => `tx${blockNumber}-${index}`),
    transactions: operations.map((operation) => ({ operations: [operation] })),
  } as never);
}

/** Counts how many times a block-reading loop was opened. */
function blockStub(blocks: NormalizedBlock[]) {
  const state = { connections: 0 };
  const streamer = {
    async *blocks(options: { signal?: AbortSignal } = {}) {
      state.connections += 1;
      for (const item of blocks) {
        if (options.signal?.aborted) return;
        yield item;
      }
      // Stay open like a live stream until aborted.
      while (!options.signal?.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    },
  } as unknown as BlockStreamer;
  return { streamer, state };
}

function engineStub(results: Record<string, unknown>, calls = { count: 0 }) {
  return {
    validator: {
      verify: async (transactionId: string) => {
        calls.count += 1;
        return (
          results[transactionId] ?? { success: null, status: "pending", info: null }
        );
      },
    } as unknown as EnginePaymentValidator,
    calls,
  };
}

function engine(blocks: NormalizedBlock[], executions: Record<string, unknown> = {}) {
  const { streamer, state } = blockStub(blocks);
  const { validator, calls } = engineStub(executions);
  const instance = new StreamEngine(
    { blocks: streamer, customJsonParser: new CustomJsonParser(), engineValidator: validator },
    { pollIntervalMs: 1, engineConfirmationAttempts: 2, engineConfirmationDelayMs: 1 },
  );
  return { instance, state, calls };
}

/** Run the engine until the expected number of events arrived. */
async function drain(stream: StreamEngine, until: () => boolean, timeoutMs = 500) {
  const running = stream.start();
  const started = Date.now();
  while (!until() && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  stream.stop();
  await running;
}

describe("unified stream engine", () => {
  it("serves many filters from a single blockchain connection", async () => {
    const { instance, state } = engine([
      block(1, [transfer(), appCustomJson("level_up"), engineTransfer()]),
    ]);

    const payments: PaymentStreamEvent[] = [];
    const customJson: CustomJsonStreamEvent[] = [];

    instance.payment({ handler: (event) => void payments.push(event) });
    instance.payment({ symbol: "HIVE", handler: (event) => void payments.push(event) });
    instance.customJson({ id: "my_app", handler: (event) => void customJson.push(event) });

    await drain(instance, () => payments.length >= 2 && customJson.length >= 1);

    expect(state.connections).toBe(1);
    expect(instance.connections).toBe(1);
    expect(customJson).toHaveLength(1);
    // Native payment hits both payment filters; the Layer 2 one stays pending.
    expect(payments.filter((p) => p.source.type === "native")).toHaveLength(2);
  });

  it("start() is idempotent and never opens a second connection", async () => {
    const { instance, state } = engine([block(1, [transfer()])]);
    const seen: PaymentStreamEvent[] = [];
    instance.payment({ handler: (event) => void seen.push(event) });

    const first = instance.start();
    const second = instance.start();
    expect(first).toBe(second);

    while (seen.length === 0) await new Promise((resolve) => setTimeout(resolve, 2));
    instance.stop();
    await first;

    expect(state.connections).toBe(1);
  });

  it("detects native and Layer 2 payments without a network filter", async () => {
    const { instance } = engine([block(1, [transfer(), engineTransfer()])], {
      "tx1-1": { success: true, status: "success", info: {} },
    });

    const sources: string[] = [];
    instance.payment({ handler: (event) => void sources.push(event.source.type) });

    await drain(instance, () => sources.length >= 2);
    expect(sources.sort()).toEqual(["layer2", "native"]);
  });

  it("only calls the handler for verified Layer 2 executions", async () => {
    const { instance } = engine([block(1, [engineTransfer()])], {
      "tx1-0": { success: false, status: "failed", error: "overdrawn balance", info: {} },
    });

    const succeeded: PaymentStreamEvent[] = [];
    const failed: PaymentStreamEvent[] = [];
    instance.payment({
      handler: (event) => void succeeded.push(event),
      onFailed: (event) => void failed.push(event),
    });

    await drain(instance, () => failed.length >= 1);
    expect(succeeded).toHaveLength(0);
    expect(failed[0]?.error).toBe("overdrawn balance");
  });

  it("filters by action and requireTrigger", async () => {
    const { instance } = engine([
      block(1, [transfer(), transfer({ memo: "just a note", amount: "1.000 HIVE" })]),
    ]);

    const purchases: PaymentStreamEvent[] = [];
    const triggered: PaymentStreamEvent[] = [];
    const everything: PaymentStreamEvent[] = [];

    instance.payment({ actions: ["purchase"], handler: (event) => void purchases.push(event) });
    instance.payment({ requireTrigger: true, handler: (event) => void triggered.push(event) });
    instance.payment({ handler: (event) => void everything.push(event) });

    await drain(instance, () => everything.length >= 2);
    expect(purchases).toHaveLength(1);
    expect(triggered).toHaveLength(1);
    expect(everything).toHaveLength(2);
  });

  it("combines filters with AND", async () => {
    const { instance } = engine([block(1, [transfer()])]);
    const matched: PaymentStreamEvent[] = [];
    const missed: PaymentStreamEvent[] = [];

    instance.payment({
      from: "alice",
      account: "shop",
      symbol: "HIVE",
      quantity: "10",
      actions: ["purchase"],
      handler: (event) => void matched.push(event),
    });
    instance.payment({
      from: "alice",
      symbol: "HBD",
      handler: (event) => void missed.push(event),
    });

    await drain(instance, () => matched.length >= 1);
    expect(matched).toHaveLength(1);
    expect(missed).toHaveLength(0);
  });

  it("stops dispatching after unsubscribe", async () => {
    const { instance } = engine([block(1, [transfer()]), block(2, [transfer()])]);
    const seen: PaymentStreamEvent[] = [];
    // Unsubscribing from inside the first handler must stop all later events.
    const subscription = instance.payment({
      handler: (event) => {
        seen.push(event);
        subscription.unsubscribe();
      },
    });

    const running = instance.start();
    while (seen.length === 0) await new Promise((resolve) => setTimeout(resolve, 2));
    expect(instance.filterCount).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 30));
    instance.stop();
    await running;

    expect(seen).toHaveLength(1);
  });

  it("reads Layer 2 execution once per transaction", async () => {
    const { instance, calls } = engine([block(1, [engineTransfer()])], {
      "tx1-0": { success: true, status: "success", info: {} },
    });

    instance.payment({ handler: () => undefined });
    instance.payment({ symbol: "BEE", handler: () => undefined });
    instance.payment({ actions: ["purchase"], handler: () => undefined });

    await drain(instance, () => calls.count >= 1);
    expect(calls.count).toBe(1);
  });

  it("skips Layer 2 verification when nothing can consume the payment", async () => {
    const { instance, calls } = engine([block(1, [engineTransfer()])]);
    instance.payment({ symbol: "SWAP.HIVE", handler: () => undefined });

    await drain(instance, () => instance.blockNumber !== null);
    expect(calls.count).toBe(0);
  });

  it("delivers every event to onEvent", async () => {
    const { instance } = engine([block(1, [transfer(), appCustomJson("level_up")])]);
    const types: string[] = [];
    instance.onEvent((event) => void types.push(event.type));

    await drain(instance, () => types.length >= 2);
    expect(types).toContain("payment");
    expect(types).toContain("custom_json");
  });

  it("keeps running when a handler throws", async () => {
    const { instance } = engine([block(1, [transfer()]), block(2, [transfer()])]);
    const good: PaymentStreamEvent[] = [];
    instance.payment({
      handler: () => {
        throw new Error("handler exploded");
      },
    });
    instance.payment({ handler: (event) => void good.push(event) });

    await drain(instance, () => good.length >= 2);
    expect(good.length).toBeGreaterThanOrEqual(2);
  });

  it("pauses and resumes without reconnecting", async () => {
    const { instance, state } = engine([block(1, [transfer()]), block(2, [transfer()])]);
    const seen: PaymentStreamEvent[] = [];
    instance.payment({ handler: (event) => void seen.push(event) });

    const running = instance.start();
    while (seen.length === 0) await new Promise((resolve) => setTimeout(resolve, 2));
    instance.pause();
    expect(instance.paused).toBe(true);
    instance.resume();
    while (seen.length < 2) await new Promise((resolve) => setTimeout(resolve, 2));
    instance.stop();
    await running;

    expect(state.connections).toBe(1);
  });

  it("scales to many filters on one stream", async () => {
    const { instance, state } = engine([block(1, [transfer()])]);
    let hits = 0;
    for (let index = 0; index < 100; index += 1) {
      instance.payment({ from: "alice", handler: () => void (hits += 1) });
    }

    await drain(instance, () => hits >= 100);
    expect(hits).toBe(100);
    expect(state.connections).toBe(1);
  });
});
