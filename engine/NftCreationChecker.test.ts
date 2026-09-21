import { describe, expect, it, vi } from "vitest";
import { HiveSdkError } from "../types/index";
import type { EngineRpcClient } from "../payments/engine/EngineRpcClient";
import { NftActionBuilder } from "./NftActionBuilder";
import { NftCreationChecker } from "./NftCreationChecker";

function makeRpc(rows: { params?: unknown; balance?: unknown; nft?: unknown }): EngineRpcClient {
  const findOne = vi.fn(async (params: Record<string, unknown>) => {
    if (params["table"] === "params") return rows.params ?? { nftCreationFee: "100" };
    if (params["table"] === "balances") return rows.balance ?? null;
    if (params["table"] === "nfts") return rows.nft ?? null;
    return null;
  });
  return { findOne } as unknown as EngineRpcClient;
}

describe("NftActionBuilder.buildCreate", () => {
  const base = { name: "Test Collection", symbol: "TESTNFT" };

  it("builds an nft.create contract action with only the required fields", () => {
    expect(new NftActionBuilder().buildCreate(base)).toEqual({
      contractName: "nft",
      contractAction: "create",
      contractPayload: { name: "Test Collection", symbol: "TESTNFT" },
    });
  });

  it("includes every optional field when provided", () => {
    const action = new NftActionBuilder().buildCreate({
      ...base,
      orgName: "Test Org",
      productName: "Test Product",
      maxSupply: "1000",
      website: "https://example.com",
      authorizedIssuingAccounts: ["alice"],
      authorizedIssuingContracts: ["market"],
    });
    expect(action.contractPayload).toEqual({
      name: "Test Collection",
      symbol: "TESTNFT",
      orgName: "Test Org",
      productName: "Test Product",
      maxSupply: "1000",
      website: "https://example.com",
      authorizedIssuingAccounts: ["alice"],
      authorizedIssuingContracts: ["market"],
    });
  });

  it("validates name, symbol, max supply, website and authorized lists", () => {
    const builder = new NftActionBuilder();
    expect(() => builder.buildCreate({ ...base, symbol: "testnft" })).toThrow(HiveSdkError);
    expect(() => builder.buildCreate({ ...base, symbol: "TOOLONGSYMBOL" })).toThrow(/uppercase/);
    expect(() => builder.buildCreate({ ...base, name: "" })).toThrow(/name/);
    expect(() => builder.buildCreate({ ...base, name: "Bad!Name" })).toThrow(/name/);
    expect(() => builder.buildCreate({ ...base, maxSupply: "0" })).toThrow(/maxSupply/);
    expect(() => builder.buildCreate({ ...base, maxSupply: "1.5" })).toThrow(/maxSupply/);
    expect(() => builder.buildCreate({ ...base, website: "x".repeat(256) })).toThrow(/website/);
    expect(() => builder.buildCreate({ ...base, authorizedIssuingAccounts: [] })).toThrow(
      /authorizedIssuingAccounts/,
    );
  });
});

describe("NftCreationChecker", () => {
  const input = { account: "alice", symbol: "TESTNFT" };

  it("passes when the account can afford the fee and the symbol is free", async () => {
    const checker = new NftCreationChecker(makeRpc({ balance: { balance: "150.00000000" } }));
    const result = await checker.check(input);
    expect(result).toMatchObject({
      fee: "100",
      balance: "150.00000000",
      hasEnoughBee: true,
      symbolExists: false,
      ok: true,
    });
    expect(result.issues).toEqual([]);
  });

  it("reports an insufficient BEE balance without throwing", async () => {
    const checker = new NftCreationChecker(makeRpc({ balance: { balance: "9.5" } }));
    const result = await checker.check(input);
    expect(result.hasEnoughBee).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatch(/9.5 BEE/);
  });

  it("reports a symbol that already exists", async () => {
    const checker = new NftCreationChecker(
      makeRpc({ balance: { balance: "500" }, nft: { symbol: "TESTNFT", issuer: "bob" } }),
    );
    const result = await checker.check(input);
    expect(result.symbolExists).toBe(true);
    expect(result.existingNft).toMatchObject({ issuer: "bob" });
    expect(result.ok).toBe(false);
  });

  it("falls back to the default fee when params are unreadable", async () => {
    const checker = new NftCreationChecker(makeRpc({ params: null }));
    expect(await checker.getCreationFee()).toBe("100");
  });

  it("throws INSUFFICIENT_BEE and NFT_ALREADY_EXISTS from assertCanCreate", async () => {
    const poor = new NftCreationChecker(makeRpc({ balance: { balance: "1" } }));
    await expect(poor.assertCanCreate(input)).rejects.toMatchObject({
      code: "INSUFFICIENT_BEE",
    });

    const taken = new NftCreationChecker(
      makeRpc({ balance: { balance: "500" }, nft: { symbol: "TESTNFT" } }),
    );
    await expect(taken.assertCanCreate(input)).rejects.toMatchObject({
      code: "NFT_ALREADY_EXISTS",
    });
  });
});
