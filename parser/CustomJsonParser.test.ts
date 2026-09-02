import { describe, expect, it } from "vitest";
import type { HiveOperation } from "../rpc/types";
import { CustomJsonParser } from "./CustomJsonParser";

const context = {
  blockNumber: 42,
  blockTimestamp: "2026-01-01T00:00:00",
  transactionId: "tx-1",
  transactionIndex: 0,
  operationIndex: 1,
};

const payload = JSON.stringify({ action: "token.mint", metadata: { symbol: "TOKEN" } });

describe("CustomJsonParser.extractOperation", () => {
  const parser = new CustomJsonParser();

  it("reads the condenser array format", () => {
    const op = parser.extractOperation([
      "custom_json",
      { required_auths: ["alice"], required_posting_auths: [], id: "my-app", json: payload },
    ]);
    expect(op?.id).toBe("my-app");
    expect(op?.required_auths).toEqual(["alice"]);
  });

  it("reads the api object format", () => {
    const op = parser.extractOperation({
      type: "custom_json_operation",
      value: { required_auths: [], required_posting_auths: ["bob"], id: "my-app", json: payload },
    });
    expect(op?.required_posting_auths).toEqual(["bob"]);
  });

  it("ignores non custom_json operations and malformed values", () => {
    expect(parser.extractOperation(["transfer", {}])).toBeNull();
    expect(parser.extractOperation(["custom_json", { id: 1, json: payload }])).toBeNull();
  });
});

describe("CustomJsonParser.parseOperation", () => {
  const parser = new CustomJsonParser();

  it("normalizes a valid event", () => {
    const result = parser.parseOperation(
      [
        "custom_json",
        { required_auths: ["alice"], required_posting_auths: [], id: "my-app", json: payload },
      ],
      context,
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.event.account).toBe("alice");
    expect(result.event.action).toBe("token.mint");
    expect(result.event.metadata).toEqual({ symbol: "TOKEN" });
    expect(result.event.blockNumber).toBe(42);
    expect(result.event.eventId).toContain("42");
  });

  it("reports malformed json instead of throwing", () => {
    const result = parser.parseOperation(
      ["custom_json", { required_auths: [], required_posting_auths: [], id: "my-app", json: "{" }],
      context,
    );
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.reason).toMatch(/Malformed JSON/);
  });

  it("rejects payloads outside the { action, metadata } protocol", () => {
    const result = parser.parseOperation(
      [
        "custom_json",
        {
          required_auths: [],
          required_posting_auths: ["bob"],
          id: "my-app",
          json: JSON.stringify({ foo: "bar" }),
        },
      ],
      context,
    );
    expect(result.status).toBe("invalid");
  });

  it("filters by application id and action", () => {
    const operation: HiveOperation = [
      "custom_json",
      { required_auths: ["alice"], required_posting_auths: [], id: "my-app", json: payload },
    ];

    expect(parser.parseOperation(operation, context, { id: "other" }).status).toBe(
      "not_custom_json",
    );
    expect(parser.parseOperation(operation, context, { actions: ["token.burn"] }).status).toBe(
      "not_custom_json",
    );
    expect(parser.parseOperation(operation, context, { actions: ["token.mint"] }).status).toBe("ok");
  });
});
