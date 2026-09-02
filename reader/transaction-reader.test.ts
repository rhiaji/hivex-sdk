import { describe, expect, it } from "vitest";

import { CustomJsonParser } from "../parser/CustomJsonParser";
import { associateTrigger, triggerFromMemo } from "../payments/trigger";
import { EnginePaymentValidator } from "../payments/engine/EnginePaymentValidator";
import {
  isCustomJsonOperation,
  isTransferOperation,
  operationName,
  readOperation,
} from "../operations/detectOperation";
import type { RpcClient } from "../rpc/RpcClient";
import { TransactionReader } from "./TransactionReader";

const ENGINE_JSON = JSON.stringify({
  contractName: "tokens",
  contractAction: "transfer",
  contractPayload: { symbol: "SCRAP", to: "shop", quantity: "5.000", memo: null },
});

function rpcStub(operations: unknown[]): RpcClient {
  return {
    call: async (method: string) => {
      if (method === "account_history_api.get_transaction") {
        return { block_num: 100, transaction_num: 2, operations };
      }
      return null;
    },
    getBlock: async () => ({ timestamp: "2026-01-01T00:00:00" }),
  } as unknown as RpcClient;
}

const reader = (operations: unknown[]) =>
  new TransactionReader(rpcStub(operations), new CustomJsonParser());

describe("operation detection", () => {
  it("reads both RPC representations", () => {
    expect(operationName(["transfer", { from: "a" }])).toBe("transfer");
    expect(operationName({ type: "custom_json_operation", value: { id: "x" } })).toBe(
      "custom_json",
    );
    expect(readOperation("nope")).toBeNull();
  });

  it("classifies operations without throwing", () => {
    expect(isTransferOperation(["transfer", {}])).toBe(true);
    expect(isCustomJsonOperation(["custom_json", {}])).toBe(true);
    expect(isCustomJsonOperation(["vote", {}])).toBe(false);
  });
});

describe("trigger association", () => {
  it("prefers a valid memo trigger", () => {
    const memoTrigger = triggerFromMemo(JSON.stringify({ action: "purchase", metadata: null }));
    const result = associateTrigger(
      { operationIndex: 3, from: "alice", memoTrigger },
      [{ operationIndex: 0, account: "alice", payload: { action: "other", metadata: null } }],
    );
    expect(result).toMatchObject({ source: "memo", trigger: { action: "purchase" } });
  });

  it("falls back to the nearest preceding custom_json of the sender", () => {
    const result = associateTrigger({ operationIndex: 4, from: "alice", memoTrigger: null }, [
      { operationIndex: 0, account: "alice", payload: { action: "first", metadata: null } },
      { operationIndex: 2, account: "alice", payload: { action: "second", metadata: null } },
      { operationIndex: 5, account: "alice", payload: { action: "later", metadata: null } },
    ]);
    expect(result).toMatchObject({ source: "custom_json", trigger: { action: "second" } });
  });

  it("never associates another account's custom_json", () => {
    const result = associateTrigger({ operationIndex: 2, from: "alice", memoTrigger: null }, [
      { operationIndex: 1, account: "mallory", payload: { action: "steal", metadata: null } },
    ]);
    expect(result).toEqual({ trigger: null, source: null });
  });

  it("ignores a malformed memo instead of failing", () => {
    expect(triggerFromMemo("just a memo")).toBeNull();
  });
});

describe("transaction reader", () => {
  it("normalizes every operation in blockchain order", async () => {
    const result = await reader([
      ["custom_json", {
        id: "my-app",
        json: JSON.stringify({ action: "purchase", metadata: { orderId: "A-1" } }),
        required_auths: ["alice"],
        required_posting_auths: [],
      }],
      ["transfer", { from: "alice", to: "shop", amount: "10.000 HIVE", memo: "" }],
      ["vote", { voter: "alice" }],
    ]).read({ transactionId: "tx1" });

    expect(result.operations.map((entry) => entry.kind)).toEqual([
      "custom_json",
      "payment",
      "unknown",
    ]);
    expect(result.blockNumber).toBe(100);
    expect(result.customJson).toHaveLength(1);
    expect(result.payments).toHaveLength(1);
    // The preceding standardized custom_json of the same sender is the trigger.
    expect(result.payments[0]?.trigger?.action).toBe("purchase");
    expect(result.payments[0]?.status).toBe("success");
  });

  it("keeps Layer 2 payments pending until execution is verified", async () => {
    const result = await reader([
      ["custom_json", {
        id: "ssc-mainnet-hive",
        json: ENGINE_JSON,
        required_auths: ["alice"],
        required_posting_auths: [],
      }],
    ]).read({ transactionId: "tx1" });

    expect(result.payments[0]).toMatchObject({
      network: "engine",
      success: null,
      status: "pending",
    });
    expect(result.payments[0]?.transfer.quantity).toBe("5.000");
  });

  it("reports invalid payloads instead of throwing", async () => {
    const result = await reader([
      ["custom_json", {
        id: "my-app",
        json: "{not json",
        required_auths: [],
        required_posting_auths: ["bob"],
      }],
    ]).read({ transactionId: "tx1" });

    expect(result.customJson).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({ kind: "custom_json", standardized: false });
  });

  it("normalizes NFT contract actions", async () => {
    const result = await reader([
      ["custom_json", {
        id: "ssc-mainnet-hive",
        json: JSON.stringify({
          contractName: "nft",
          contractAction: "transfer",
          contractPayload: {
            to: "null",
            toType: "user",
            nfts: [{ symbol: "SCRAPNFT", ids: ["1", "2"] }],
          },
        }),
        required_auths: ["alice"],
        required_posting_auths: [],
      }],
    ]).read({ transactionId: "tx1" });

    expect(result.nfts).toHaveLength(1);
    // A burn IS a transfer to "null" — the flag says so, the action stays true
    // to the protocol.
    expect(result.nfts[0]).toMatchObject({ action: "transfer", to: "null", burn: true });
    expect(result.nfts[0]?.nfts).toEqual([{ symbol: "SCRAPNFT", ids: ["1", "2"] }]);
  });
});

describe("Layer 2 execution matching", () => {
  const validator = new EnginePaymentValidator({} as never);

  const logs = JSON.stringify({
    events: [
      {
        contract: "tokens",
        event: "transfer",
        data: { from: "alice", to: "shop", symbol: "SCRAP", quantity: "5.000" },
      },
    ],
  });

  it("credits only the matching transfer of a multi-transfer transaction", () => {
    expect(
      validator.fromLogs({ logs }, { from: "alice", to: "shop", symbol: "SCRAP", quantity: "5" }),
    ).toMatchObject({ success: true, status: "success" });

    expect(
      validator.fromLogs({ logs }, { from: "alice", to: "someone-else", symbol: "SCRAP" }),
    ).toMatchObject({ success: false, status: "failed" });
  });
});
