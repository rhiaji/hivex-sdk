import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { KeychainIssuer } from "./KeychainIssuer";
import { KeychainClient } from "./KeychainClient";
import { HIVE_ENGINE_CUSTOM_JSON_ID, TokenCreationChecker } from "../engine/index";
import type { EngineRpcClient } from "../payments/engine/EngineRpcClient";
import { HiveSdkError } from "../types/index";
import type { HiveKeychainApi, KeychainResponse } from "./types";

interface Captured {
  account: string;
  id: string;
  keyType: string;
  json: string;
  message: string;
}

let captured: Captured[] = [];

function installKeychain(response: KeychainResponse = { success: true, result: { id: "abc123" } }) {
  const api: HiveKeychainApi = {
    requestCustomJson: (account, id, keyType, json, message, callback) => {
      captured.push({ account, id, keyType, json, message });
      callback(response);
    },
  };
  (globalThis as { window?: unknown }).window = { hive_keychain: api };
}

describe("KeychainIssuer", () => {
  beforeEach(() => {
    captured = [];
    installKeychain();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it("broadcasts a tokens.issue contract action with active authority", async () => {
    const client = new KeychainIssuer(new KeychainClient());
    const result = await client.token.issue({
      username: "alice",
      symbol: "TOKEN",
      account: "bob",
      quantity: "100.000",
    });

    expect(result.success).toBe(true);
    expect(result.transactionId).toBe("abc123");
    expect(captured).toHaveLength(1);
    expect(captured[0]!.account).toBe("alice");
    expect(captured[0]!.id).toBe(HIVE_ENGINE_CUSTOM_JSON_ID);
    expect(captured[0]!.keyType).toBe("Active");
    expect(JSON.parse(captured[0]!.json)).toEqual({
      contractName: "tokens",
      contractAction: "issue",
      contractPayload: { symbol: "TOKEN", to: "bob", quantity: "100.000" },
    });
  });

  it("includes the memo only when provided", async () => {
    const client = new KeychainIssuer(new KeychainClient());
    await client.token.transfer({
      username: "alice",
      symbol: "TOKEN",
      account: "bob",
      quantity: "1",
      memo: "hello",
    });
    const payload = JSON.parse(captured[0]!.json) as { contractPayload: Record<string, unknown> };
    expect(payload.contractPayload["memo"]).toBe("hello");
  });

  it("rejects float quantities", async () => {
    const client = new KeychainIssuer(new KeychainClient());
    await expect(
      client.token.burn({
        username: "alice",
        symbol: "TOKEN",
        quantity: 10 as unknown as string,
      }),
    ).rejects.toThrow(HiveSdkError);
    expect(captured).toHaveLength(0);
  });

  it("requires a signing username", async () => {
    const client = new KeychainIssuer(new KeychainClient());
    await expect(
      client.token.issue({ username: "", symbol: "TOKEN", account: "bob", quantity: "1" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("broadcasts nft.issue and nft.transfer actions", async () => {
    const client = new KeychainIssuer(new KeychainClient());
    await client.nft.issue({
      username: "alice",
      symbol: "COLLECTION",
      account: "bob",
      feeSymbol: "BEE",
      properties: { level: 1 },
    });
    await client.nft.transfer({
      username: "alice",
      account: "bob",
      nfts: [{ symbol: "COLLECTION", ids: ["1", "2"] }],
    });

    expect(JSON.parse(captured[0]!.json)).toEqual({
      contractName: "nft",
      contractAction: "issue",
      contractPayload: {
        symbol: "COLLECTION",
        to: "bob",
        feeSymbol: "BEE",
        properties: { level: 1 },
      },
    });
    expect(JSON.parse(captured[1]!.json)).toEqual({
      contractName: "nft",
      contractAction: "transfer",
      contractPayload: { to: "bob", nfts: [{ symbol: "COLLECTION", ids: ["1", "2"] }] },
    });
  });

  it("enforces the issueMultiple instance limit before touching Keychain", async () => {
    const client = new KeychainIssuer(new KeychainClient());
    await expect(
      client.nft.issueMultiple({
        username: "alice",
        instances: Array.from({ length: 11 }, () => ({
          symbol: "COLLECTION",
          account: "bob",
          feeSymbol: "BEE",
        })),
      }),
    ).rejects.toMatchObject({ code: "NFT_TRANSFER_LIMIT_ERROR" });
    expect(captured).toHaveLength(0);
  });

  it("maps a user cancellation to KEYCHAIN_REJECTED", async () => {
    installKeychain({ success: false, message: "Request was canceled by the user." });
    const client = new KeychainIssuer(new KeychainClient());
    await expect(
      client.token.issue({
        username: "alice",
        symbol: "TOKEN",
        account: "bob",
        quantity: "1",
      }),
    ).rejects.toMatchObject({ code: "KEYCHAIN_REJECTED" });
  });

  it("throws KEYCHAIN_UNAVAILABLE without the extension", async () => {
    delete (globalThis as { window?: unknown }).window;
    const client = new KeychainIssuer(new KeychainClient());
    await expect(
      client.token.issue({
        username: "alice",
        symbol: "TOKEN",
        account: "bob",
        quantity: "1",
      }),
    ).rejects.toMatchObject({ code: "KEYCHAIN_UNAVAILABLE" });
  });
});

describe("KeychainIssuer burn destinations", () => {
  beforeEach(() => {
    captured = [];
    installKeychain();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it("burns tokens to null by default and to a custom account when given", async () => {
    const client = new KeychainIssuer(new KeychainClient());

    await client.token.burn({ username: "alice", symbol: "TOKEN", quantity: "5" });
    expect(JSON.parse(captured[0]!.json).contractPayload.to).toBe("null");

    await client.token.burn({
      username: "alice",
      symbol: "TOKEN",
      quantity: "5",
      account: "graveyard",
    });
    expect(JSON.parse(captured[1]!.json).contractPayload.to).toBe("graveyard");
  });

  it("burns NFTs to null by default and to a custom account when given", async () => {
    const client = new KeychainIssuer(new KeychainClient());

    const result = await client.nft.burn({ username: "alice", symbol: "CARD", id: "42" });
    expect(result.transactionId).toBe("abc123");
    expect(JSON.parse(captured[0]!.json).contractPayload).toEqual({
      to: "null",
      nfts: [{ symbol: "CARD", ids: ["42"] }],
    });

    await client.nft.burn({ username: "alice", symbol: "CARD", id: ["1"], account: "graveyard" });
    expect(JSON.parse(captured[1]!.json).contractPayload.to).toBe("graveyard");
  });
});

function makeChecker(rows: { balance?: string; token?: unknown }): TokenCreationChecker {
  const findOne = vi.fn(async (params: Record<string, unknown>) => {
    if (params["table"] === "params") return { tokenCreationFee: "100" };
    if (params["table"] === "balances") {
      return rows.balance === undefined ? null : { balance: rows.balance };
    }
    return rows.token ?? null;
  });
  return new TokenCreationChecker({ findOne } as unknown as EngineRpcClient);
}

describe("KeychainIssuer token creation", () => {
  beforeEach(() => {
    captured = [];
    installKeychain();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  const input = {
    username: "rhiaji",
    symbol: "SCRAP",
    name: "Scrap Token",
    precision: 3,
    maxSupply: "1000000",
  };

  it("broadcasts tokens.create once the checks pass", async () => {
    const client = new KeychainIssuer(new KeychainClient(), makeChecker({ balance: "250" }));
    const result = await client.token.create({ ...input, url: "https://scrap.gg" });

    expect(result.transactionId).toBe("abc123");
    expect(captured[0]!.keyType).toBe("Active");
    expect(captured[0]!.message).toContain("SCRAP");
    expect(JSON.parse(captured[0]!.json)).toEqual({
      contractName: "tokens",
      contractAction: "create",
      contractPayload: {
        symbol: "SCRAP",
        name: "Scrap Token",
        precision: 3,
        maxSupply: "1000000",
        url: "https://scrap.gg",
      },
    });
  });

  it("never opens Keychain when the BEE balance is too low", async () => {
    const client = new KeychainIssuer(new KeychainClient(), makeChecker({ balance: "8.45434186" }));
    await expect(client.token.create(input)).rejects.toThrow(HiveSdkError);
    expect(captured).toHaveLength(0);
  });

  it("never opens Keychain when the symbol already exists", async () => {
    const client = new KeychainIssuer(
      new KeychainClient(),
      makeChecker({ balance: "500", token: { symbol: "SCRAP" } }),
    );
    await client.token
      .create(input)
      .catch((error: HiveSdkError) => expect(error.code).toBe("TOKEN_ALREADY_EXISTS"));
    expect(captured).toHaveLength(0);
  });

  it("reports the checks without broadcasting", async () => {
    const client = new KeychainIssuer(new KeychainClient(), makeChecker({ balance: "8.45434186" }));
    const check = await client.token.checkCreate({ username: "rhiaji", symbol: "SCRAP" });

    expect(check).toMatchObject({ fee: "100", balance: "8.45434186", ok: false });
    expect(captured).toHaveLength(0);
  });

  it("can skip the checks explicitly", async () => {
    const client = new KeychainIssuer(new KeychainClient(), makeChecker({ balance: "0" }));
    const result = await client.token.create({ ...input, skipChecks: true });
    expect(result.transactionId).toBe("abc123");
    expect(captured).toHaveLength(1);
  });
});
