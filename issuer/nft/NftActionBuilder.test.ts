import { describe, expect, it } from "vitest";
import { NFT_ACTIONS, NFT_CONTRACT } from "../../engine/index";
import { NftActionBuilder, countNftInstances } from "../../engine/NftActionBuilder";
import { NftSymbolError, NftTransferLimitError, NftValidationError } from "./errors";

const builder = new NftActionBuilder();

describe("NftActionBuilder.buildIssue", () => {
  it("builds a Hive Engine nft.issue contract action", () => {
    const action = builder.buildIssue({
      symbol: "COLLECTION",
      account: "alice",
      feeSymbol: "BEE",
      properties: { level: 1 },
    });

    expect(action).toEqual({
      contractName: NFT_CONTRACT,
      contractAction: NFT_ACTIONS.issue,
      contractPayload: {
        symbol: "COLLECTION",
        to: "alice",
        feeSymbol: "BEE",
        properties: { level: 1 },
      },
    });
  });

  it("includes account types and locked assets when provided", () => {
    const action = builder.buildIssue({
      symbol: "COLLECTION",
      account: "market",
      accountType: "contract",
      fromType: "user",
      feeSymbol: "BEE",
      lockTokens: { BEE: "1.000" },
      lockNfts: [{ symbol: "OTHER", ids: ["1"] }],
    });

    expect(action.contractPayload).toMatchObject({
      toType: "contract",
      fromType: "user",
      lockTokens: { BEE: "1.000" },
      lockNfts: [{ symbol: "OTHER", ids: ["1"] }],
    });
  });

  it("rejects invalid input", () => {
    expect(() => builder.buildIssue({ symbol: "", account: "a", feeSymbol: "BEE" })).toThrow(
      NftSymbolError,
    );
    expect(() => builder.buildIssue({ symbol: "S", account: "", feeSymbol: "BEE" })).toThrow(
      NftValidationError,
    );
    expect(() =>
      builder.buildIssue({
        symbol: "S",
        account: "a",
        feeSymbol: "BEE",
        properties: [] as unknown as Record<string, unknown>,
      }),
    ).toThrow(NftValidationError);
  });
});

describe("NftActionBuilder.buildIssueMultiple", () => {
  it("builds one payload per instance", () => {
    const action = builder.buildIssueMultiple({
      instances: [
        { symbol: "A", account: "alice", feeSymbol: "BEE" },
        { symbol: "A", account: "bob", feeSymbol: "BEE" },
      ],
    });

    expect(action.contractAction).toBe(NFT_ACTIONS.issueMultiple);
    expect((action.contractPayload as { instances: unknown[] }).instances).toHaveLength(2);
  });

  it("enforces the 10 instance limit", () => {
    expect(() =>
      builder.buildIssueMultiple({
        instances: Array.from({ length: 11 }, () => ({
          symbol: "A",
          account: "alice",
          feeSymbol: "BEE",
        })),
      }),
    ).toThrow(NftTransferLimitError);
  });

  it("rejects an empty instance list", () => {
    expect(() => builder.buildIssueMultiple({ instances: [] })).toThrow(NftValidationError);
  });
});

describe("NftActionBuilder.buildTransfer", () => {
  it("builds a nft.transfer contract action", () => {
    const action = builder.buildTransfer({
      account: "alice",
      nfts: [{ symbol: "COLLECTION", ids: ["1", "2"] }],
    });

    expect(action).toEqual({
      contractName: NFT_CONTRACT,
      contractAction: NFT_ACTIONS.transfer,
      contractPayload: {
        to: "alice",
        nfts: [{ symbol: "COLLECTION", ids: ["1", "2"] }],
      },
    });
  });

  it("enforces the 50 instance transfer limit", () => {
    expect(() =>
      builder.buildTransfer({
          account: "alice",
        nfts: [{ symbol: "A", ids: Array.from({ length: 51 }, (_, i) => String(i)) }],
      }),
    ).toThrow(NftTransferLimitError);
  });

  it("rejects malformed ids", () => {
    expect(() =>
      builder.buildTransfer({
          account: "alice",
        nfts: [{ symbol: "A", ids: [1 as unknown as string] }],
      }),
    ).toThrow(NftValidationError);
  });
});

describe("countNftInstances", () => {
  it("sums ids across items", () => {
    expect(
      countNftInstances([
        { symbol: "A", ids: ["1", "2"] },
        { symbol: "B", ids: ["3"] },
      ]),
    ).toBe(3);
    expect(countNftInstances([])).toBe(0);
  });
});

describe("NftActionBuilder burn", () => {
  it("burns to null by default", () => {
    const action = new NftActionBuilder().buildBurn({ symbol: "CARD", id: "1" });
    expect(action.contractAction).toBe("transfer");
    expect(action.contractPayload["to"]).toBe("null");
    expect(action.contractPayload["nfts"]).toEqual([{ symbol: "CARD", ids: ["1"] }]);
  });

  it("accepts several ids and a custom destination", () => {
    const action = new NftActionBuilder().buildBurn({
      symbol: "CARD",
      id: ["1", "2"],
      account: "graveyard",
    });
    expect(action.contractPayload["to"]).toBe("graveyard");
    expect(action.contractPayload["nfts"]).toEqual([{ symbol: "CARD", ids: ["1", "2"] }]);
  });

  it("rejects an empty id list", () => {
    expect(() => new NftActionBuilder().buildBurn({ symbol: "CARD", id: [] })).toThrow();
  });
});
