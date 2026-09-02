import { describe, expect, it } from "vitest";
import { actionPayloadBuilder, actionPayloadParser } from "../protocol/index";
import { formatNativeAsset, parseNativeAsset, quantitiesEqual } from "./amount";
import { hivePaymentBuilder } from "./hive/HivePaymentBuilder";
import { hivePaymentParser } from "./hive/HivePaymentParser";
import { enginePaymentBuilder } from "./engine/EnginePaymentBuilder";
import { enginePaymentParser } from "./engine/EnginePaymentParser";
import { EnginePaymentValidator } from "./engine/EnginePaymentValidator";
import type { EngineRpcClient } from "./engine/EngineRpcClient";
import { PaymentValidator } from "./PaymentValidator";
import type { TransactionReader } from "../reader/TransactionReader";
import type { ParsedPayment } from "./types";

describe("action payload protocol", () => {
  it("builds the standardized payload with null metadata by default", () => {
    expect(actionPayloadBuilder.build({ action: "purchase" })).toEqual({
      action: "purchase",
      metadata: null,
    });
  });

  it("rejects an empty action and non-object metadata", () => {
    expect(() => actionPayloadBuilder.build({ action: "  " })).toThrow(/non-empty string/);
    expect(() =>
      actionPayloadBuilder.build({ action: "a", metadata: 42 as unknown as null }),
    ).toThrow(/object or null/);
  });

  it("parses memos without throwing on malformed input", () => {
    expect(actionPayloadParser.parse('{"action":"buy","metadata":{"id":1}}')).toEqual({
      action: "buy",
      metadata: { id: 1 },
    });
    expect(actionPayloadParser.parse("not json")).toBeNull();
    expect(actionPayloadParser.parse('{"foo":1}')).toBeNull();
    expect(actionPayloadParser.parse("")).toBeNull();
  });
});

describe("amounts", () => {
  it("formats native assets with three decimals", () => {
    expect(formatNativeAsset("10", "HIVE")).toBe("10.000 HIVE");
    expect(formatNativeAsset("0.5", "HBD")).toBe("0.500 HBD");
  });

  it("rejects numbers and excess precision", () => {
    expect(() => formatNativeAsset(1 as unknown as string, "HIVE")).toThrow(/decimal string/);
    expect(() => formatNativeAsset("1.0001", "HIVE")).toThrow(/at most 3 decimals/);
  });

  it("parses both asset representations", () => {
    expect(parseNativeAsset("10.000 HIVE")).toEqual({ quantity: "10.000", symbol: "HIVE" });
    expect(parseNativeAsset({ amount: "10000", precision: 3, nai: "@@000000013" })).toEqual({
      quantity: "10.000",
      symbol: "HBD",
    });
    expect(parseNativeAsset("nope")).toBeNull();
  });

  it("compares quantities without floating point", () => {
    expect(quantitiesEqual("100", "100.000")).toBe(true);
    expect(quantitiesEqual("0.1", "0.10")).toBe(true);
    expect(quantitiesEqual("1", "1.001")).toBe(false);
  });
});

describe("native payments", () => {
  it("builds a transfer operation carrying the trigger memo", () => {
    const operation = hivePaymentBuilder.buildOperation("alice", {
      account: "bob",
      amount: "10",
      symbol: "HIVE",
      action: "purchase",
      metadata: { orderId: "A-1" },
    });

    expect(operation[0]).toBe("transfer");
    expect(operation[1]).toEqual({
      from: "alice",
      to: "bob",
      amount: "10.000 HIVE",
      memo: '{"action":"purchase","metadata":{"orderId":"A-1"}}',
    });
  });

  it("round-trips through the parser and is final on inclusion", () => {
    const operation = hivePaymentBuilder.buildOperation("alice", {
      account: "bob",
      amount: "10",
      symbol: "HIVE",
      action: "purchase",
    });

    const parsed = hivePaymentParser.parseOperation(operation, { transactionId: "tx1" });
    expect(parsed?.network).toBe("hive");
    expect(parsed?.status).toBe("success");
    expect(parsed?.success).toBe(true);
    expect(parsed?.transfer).toMatchObject({ from: "alice", account: "bob", quantity: "10.000" });
    expect(parsed?.trigger?.action).toBe("purchase");
  });

  it("keeps a transfer with an unreadable memo, with a null trigger", () => {
    const parsed = hivePaymentParser.parseOperation([
      "transfer",
      { from: "alice", to: "bob", amount: "1.000 HBD", memo: "thanks!" },
    ]);
    expect(parsed?.trigger).toBeNull();
    expect(parsed?.transfer.symbol).toBe("HBD");
  });

  it("ignores operations that are not transfers", () => {
    expect(hivePaymentParser.parseOperation(["vote", { voter: "alice" }])).toBeNull();
  });
});

describe("engine payments", () => {
  const built = enginePaymentBuilder.build({
    account: "bob",
    symbol: "SWAP.HIVE",
    quantity: "5.5",
    action: "subscription",
    metadata: { plan: "pro" },
  });

  it("builds a tokens.transfer action with the trigger in the memo", () => {
    expect(built.id).toBe("ssc-mainnet-hive");
    expect(built.engineAction).toEqual({
      contractName: "tokens",
      contractAction: "transfer",
      contractPayload: {
        symbol: "SWAP.HIVE",
        to: "bob",
        quantity: "5.5",
        memo: '{"action":"subscription","metadata":{"plan":"pro"}}',
      },
    });
  });

  it("parses a sidechain custom_json as pending, never as success", () => {
    const parsed = enginePaymentParser.parseOperation([
      "custom_json",
      {
        required_auths: ["alice"],
        required_posting_auths: [],
        id: "ssc-mainnet-hive",
        json: JSON.stringify(built.engineAction),
      },
    ]);

    expect(parsed?.network).toBe("engine");
    expect(parsed?.success).toBeNull();
    expect(parsed?.status).toBe("pending");
    expect(parsed?.transfer).toMatchObject({ from: "alice", account: "bob", quantity: "5.5" });
    expect(parsed?.trigger?.action).toBe("subscription");
  });

  it("ignores other sidechain contracts", () => {
    const parsed = enginePaymentParser.parseOperation([
      "custom_json",
      {
        required_auths: ["alice"],
        required_posting_auths: [],
        id: "ssc-mainnet-hive",
        json: JSON.stringify({
          contractName: "market",
          contractAction: "buy",
          contractPayload: {},
        }),
      },
    ]);
    expect(parsed).toBeNull();
  });
});

describe("engine execution validation", () => {
  const validator = new EnginePaymentValidator({} as EngineRpcClient);

  it("treats contract errors as a failed payment", () => {
    const result = validator.fromLogs({ logs: JSON.stringify({ errors: ["overdrawn balance"] }) });
    expect(result).toMatchObject({ success: false, status: "failed", error: "overdrawn balance" });
  });

  it("treats emitted events as a successful payment", () => {
    const result = validator.fromLogs({
      logs: JSON.stringify({ events: [{ contract: "tokens", event: "transfer" }] }),
    });
    expect(result).toMatchObject({ success: true, status: "success" });
  });

  it("treats an empty log as a failed execution", () => {
    expect(validator.fromLogs({ logs: "{}" })).toMatchObject({ success: false, status: "failed" });
  });

  it("stays pending when the sidechain has no readable logs yet", () => {
    expect(validator.fromLogs({})).toMatchObject({ success: null, status: "pending" });
  });
});

describe("payment validation", () => {
  const nativePayment: ParsedPayment = {
    network: "hive",
    transactionId: "tx1",
    success: true,
    status: "success",
    transfer: { from: "alice", account: "bob", symbol: "HIVE", quantity: "10.000", memo: null },
    trigger: { action: "purchase", metadata: { orderId: "A-1" } },
  };

  const readerStub = (payments: ParsedPayment[]) =>
    ({ read: async () => ({ payments }) }) as unknown as TransactionReader;
  const engineStub = (result: unknown) =>
    ({ verify: async () => result }) as unknown as EnginePaymentValidator;

  it("accepts a payment matching every expectation", async () => {
    const validator = new PaymentValidator(readerStub([nativePayment]), engineStub(null));
    const result = await validator.validate({
      transactionId: "tx1",
      expected: { from: "alice", account: "bob", symbol: "HIVE", quantity: "10", action: "purchase" },
    });
    expect(result.status).toBe("success");
    expect(result.success).toBe(true);
  });

  it("marks a mismatched amount as invalid", async () => {
    const validator = new PaymentValidator(readerStub([nativePayment]), engineStub(null));
    const result = await validator.validate({
      transactionId: "tx1",
      expected: { quantity: "5" },
    });
    expect(result.status).toBe("invalid");
    expect(result.error).toMatch(/Expected quantity/);
  });

  it("fails a Layer 2 payment whose execution failed", async () => {
    const enginePayment: ParsedPayment = {
      ...nativePayment,
      network: "engine",
      success: null,
      status: "pending",
    };
    const validator = new PaymentValidator(
      readerStub([enginePayment]),
      engineStub({ success: false, status: "failed", error: "overdrawn balance" }),
    );
    const result = await validator.validate({ transactionId: "tx1" });
    expect(result).toMatchObject({ success: false, status: "failed", error: "overdrawn balance" });
  });

  it("reports invalid when the transaction carries no supported payment", async () => {
    const validator = new PaymentValidator(readerStub([]), engineStub(null));
    const result = await validator.validate({ transactionId: "tx1" });
    expect(result.status).toBe("invalid");
  });
});
