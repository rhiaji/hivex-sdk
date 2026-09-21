import { describe, expect, it, vi } from "vitest";
import { HiveSdkError } from "../types/index";
import type { EngineRpcClient } from "../payments/engine/EngineRpcClient";
import { TokenActionBuilder } from "./TokenActionBuilder";
import { TokenCreationChecker, compareDecimalStrings } from "./TokenCreationChecker";

function makeRpc(rows: {
  params?: unknown;
  balance?: unknown;
  token?: unknown;
}): EngineRpcClient {
  const findOne = vi.fn(async (params: Record<string, unknown>) => {
    if (params["table"] === "params") return rows.params ?? { tokenCreationFee: "100" };
    if (params["table"] === "balances") return rows.balance ?? null;
    if (params["table"] === "tokens") return rows.token ?? null;
    return null;
  });
  return { findOne } as unknown as EngineRpcClient;
}

describe("TokenActionBuilder.buildCreate", () => {
  const base = { symbol: "SCRAP", name: "Scrap Token", precision: 3, maxSupply: "1000000" };

  it("builds a tokens.create contract action", () => {
    expect(new TokenActionBuilder().buildCreate({ ...base, url: "https://x.com" })).toEqual({
      contractName: "tokens",
      contractAction: "create",
      contractPayload: {
        symbol: "SCRAP",
        name: "Scrap Token",
        precision: 3,
        maxSupply: "1000000",
        url: "https://x.com",
      },
    });
  });

  it("omits url when it is not provided", () => {
    const action = new TokenActionBuilder().buildCreate(base);
    expect(action.contractPayload).not.toHaveProperty("url");
  });

  it("validates symbol, name, precision and max supply", () => {
    const builder = new TokenActionBuilder();
    expect(() => builder.buildCreate({ ...base, symbol: "scrap" })).toThrow(HiveSdkError);
    expect(() => builder.buildCreate({ ...base, symbol: "TOOLONGSYMBOL" })).toThrow(/uppercase/);
    expect(() => builder.buildCreate({ ...base, name: "" })).toThrow(/name/);
    expect(() => builder.buildCreate({ ...base, name: "Bad!Name" })).toThrow(/name/);
    expect(() => builder.buildCreate({ ...base, precision: 9 })).toThrow(/precision/);
    expect(() => builder.buildCreate({ ...base, precision: 1.5 })).toThrow(/precision/);
    expect(() => builder.buildCreate({ ...base, maxSupply: "0" })).toThrow(/greater than zero/);
    expect(() =>
      builder.buildCreate({ ...base, maxSupply: "9007199254740992000" }),
    ).toThrow(/maxSupply/);
    expect(() => builder.buildCreate({ ...base, url: "x".repeat(256) })).toThrow(/url/);
  });
});

describe("compareDecimalStrings", () => {
  it("compares without floating point math", () => {
    expect(compareDecimalStrings("8.45434186", "100")).toBe(-1);
    expect(compareDecimalStrings("100", "100.000")).toBe(0);
    expect(compareDecimalStrings("100.00000001", "100")).toBe(1);
    expect(compareDecimalStrings("0", "0.00000001")).toBe(-1);
  });
});

describe("TokenCreationChecker", () => {
  it("passes when the account can afford the fee and the symbol is free", async () => {
    const checker = new TokenCreationChecker(makeRpc({ balance: { balance: "250.5" } }));
    const result = await checker.check({ account: "rhiaji", symbol: "SCRAP" });

    expect(result.fee).toBe("100");
    expect(result.balance).toBe("250.5");
    expect(result.hasEnoughBee).toBe(true);
    expect(result.symbolExists).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("reports an insufficient BEE balance", async () => {
    const checker = new TokenCreationChecker(makeRpc({ balance: { balance: "8.45434186" } }));
    const result = await checker.check({ account: "rhiaji", symbol: "SCRAP" });

    expect(result.hasEnoughBee).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toContain("8.45434186 BEE");
  });

  it("treats a missing balance row as zero BEE", async () => {
    const checker = new TokenCreationChecker(makeRpc({}));
    expect(await checker.getBeeBalance("rhiaji")).toBe("0");
  });

  it("reports an existing symbol", async () => {
    const checker = new TokenCreationChecker(
      makeRpc({ balance: { balance: "500" }, token: { symbol: "SCRAP", issuer: "someone" } }),
    );
    const result = await checker.check({ account: "rhiaji", symbol: "SCRAP" });

    expect(result.symbolExists).toBe(true);
    expect(result.existingToken?.issuer).toBe("someone");
    expect(result.ok).toBe(false);
  });

  it("falls back to the default fee when params cannot be read", async () => {
    const checker = new TokenCreationChecker(makeRpc({ params: null }));
    expect(await checker.getCreationFee()).toBe("100");
  });

  it("uses the sidechain fee when it differs", async () => {
    const checker = new TokenCreationChecker(makeRpc({ params: { tokenCreationFee: "250" } }));
    expect(await checker.getCreationFee()).toBe("250");
  });

  it("throws INSUFFICIENT_BEE then TOKEN_ALREADY_EXISTS from assertCanCreate", async () => {
    const poor = new TokenCreationChecker(makeRpc({ balance: { balance: "1" } }));
    await expect(poor.assertCanCreate({ account: "rhiaji", symbol: "SCRAP" })).rejects.toThrow(
      /token creation costs/,
    );
    await poor
      .assertCanCreate({ account: "rhiaji", symbol: "SCRAP" })
      .catch((error: HiveSdkError) => expect(error.code).toBe("INSUFFICIENT_BEE"));

    const taken = new TokenCreationChecker(
      makeRpc({ balance: { balance: "500" }, token: { symbol: "SCRAP" } }),
    );
    await taken
      .assertCanCreate({ account: "rhiaji", symbol: "SCRAP" })
      .catch((error: HiveSdkError) => expect(error.code).toBe("TOKEN_ALREADY_EXISTS"));
  });
});
