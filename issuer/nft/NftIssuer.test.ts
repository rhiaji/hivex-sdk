import { describe, expect, it, vi } from "vitest";
import { HIVE_ENGINE_CUSTOM_JSON_ID, NftActionBuilder } from "../../engine/index";
import { HiveSdkError } from "../../types/index";
import { createAccountReference } from "../../configs/AccountReference";
import type { IssuerContext } from "../IssuerDispatcher";
import { NftIssuer } from "./NftIssuer";
import { NftAccountResolutionError, NftValidationError } from "./errors";

const TEST_WIF = "5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ";

const ref = (alias: string) => createAccountReference(alias, {});

function makeContext(overrides: Partial<IssuerContext> = {}): IssuerContext {
  return {
    rpc: { call: vi.fn() } as unknown as IssuerContext["rpc"],
    keychain: { customJsonRaw: vi.fn() } as unknown as IssuerContext["keychain"],
    builder: {} as IssuerContext["builder"],
    resolveSigningAccount: (alias: string) => ({ alias, account: "issuer-account", key: TEST_WIF }),
    resolveAccount: (alias: string) => {
      if (alias !== "nftIssuer") {
        throw new HiveSdkError("ACCOUNT_ALIAS_NOT_FOUND", `Unknown alias "${alias}"`);
      }
      return { alias, account: "issuer-account" };
    },
    applicationId: "my-app",
    ...overrides,
  };
}

describe("NftIssuer offline builders", () => {
  it("resolves the alias and emits a Hive Engine custom_json operation", () => {
    const issuer = new NftIssuer(makeContext());

    const preview = issuer.buildIssue({
      from: ref("nftIssuer"),
      symbol: "COLLECTION",
      account: "alice",
      feeSymbol: "BEE",
    });

    expect(preview.alias).toBe("nftIssuer");
    expect(preview.account).toBe("issuer-account");
    expect(preview.destination).toBe("alice");
    expect(preview.id).toBe(HIVE_ENGINE_CUSTOM_JSON_ID);

    const operation = preview.operation as [string, { required_auths: string[]; id: string }];
    expect(operation[0]).toBe("custom_json");
    expect(operation[1].required_auths).toEqual(["issuer-account"]);
    expect(JSON.parse(preview.json)).toMatchObject({
      contractName: "nft",
      contractAction: "issue",
    });
  });

  it("never signs or broadcasts while building a preview", () => {
    const sign = vi.fn();
    const call = vi.fn();
    const issuer = new NftIssuer(
      makeContext({
        rpc: { call } as unknown as IssuerContext["rpc"],
      }),
    );

    issuer.buildTransfer({
      from: ref("nftIssuer"),
      account: "alice",
      nfts: [{ symbol: "COLLECTION", ids: ["1", "2"] }],
    });

    expect(sign).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it("supports transfer previews and instance counting", () => {
    const issuer = new NftIssuer(makeContext());
    const input = {
      from: ref("nftIssuer"),
      account: "alice",
      nfts: [{ symbol: "COLLECTION", ids: ["1", "2", "3"] }],
    };

    expect(issuer.countInstances(input)).toBe(3);
    expect(JSON.parse(issuer.buildTransfer(input).json).contractAction).toBe("transfer");
  });

  it("previews issueMultiple actions", () => {
    const issuer = new NftIssuer(makeContext());
    const preview = issuer.buildIssueMultiple({
      from: ref("nftIssuer"),
      instances: [
        { symbol: "COLLECTION", account: "alice", feeSymbol: "BEE" },
        { symbol: "COLLECTION", account: "bob", feeSymbol: "BEE" },
      ],
    });
    expect(JSON.parse(preview.json).contractAction).toBe("issueMultiple");
  });

  it("maps alias failures to NftAccountResolutionError", () => {
    const issuer = new NftIssuer(makeContext());
    expect(() =>
      issuer.buildTransfer({
        from: ref("unknownAlias"),
        account: "alice",
        nfts: [{ symbol: "A", ids: ["1"] }],
      }),
    ).toThrow(NftAccountResolutionError);
  });

  it("requires a from account reference", () => {
    const issuer = new NftIssuer(makeContext());
    expect(() =>
      issuer.buildTransfer({
        from: "" as unknown as ReturnType<typeof ref>,
        account: "alice",
        nfts: [{ symbol: "A", ids: ["1"] }],
      }),
    ).toThrow(NftValidationError);
  });
});

describe("NftIssuer signing path", () => {
  it("signs with the configured private key and broadcasts through hive.rpc", async () => {
    const call = vi.fn().mockImplementation((method: string) => {
      if (method === "condenser_api.get_dynamic_global_properties") {
        return Promise.resolve({ head_block_number: 100, head_block_id: "0000006400112233445566778899aabbccddeeff", time: "2026-01-01T00:00:00" });
      }
      if (method === "condenser_api.get_block") {
        return Promise.resolve({ block: { previous: "00000063abcdef", timestamp: "2026-01-01T00:00:00" } });
      }
      return Promise.resolve({ id: "tx123" });
    });

    const issuer = new NftIssuer(
      makeContext({
        rpc: { call } as unknown as IssuerContext["rpc"],
        resolveSigningAccount: (alias: string) => ({
          alias,
          account: "issuer-account",
          key: TEST_WIF,
        }),
      }),
    );

    const result = await issuer.issue({
      from: ref("nftIssuer"),
      symbol: "COLLECTION",
      account: "alice",
      feeSymbol: "BEE",
    });

    expect(result.transactionId).toBe("tx123");
    expect(result.action).toBe("issue");
    expect(
      call.mock.calls.some(([method]) => method === "condenser_api.broadcast_transaction_synchronous"),
    ).toBe(true);
  });
});

describe("NftIssuer burn", () => {
  it("burns to null by default and accepts a custom destination", () => {
    const issuer = new NftIssuer(makeContext());

    const preview = issuer.buildBurn({ from: ref("nftIssuer"), symbol: "CARD", id: "42" });
    const action = JSON.parse(preview.json);
    expect(action.contractAction).toBe("transfer");
    expect(action.contractPayload.to).toBe("null");
    expect(action.contractPayload.nfts).toEqual([{ symbol: "CARD", ids: ["42"] }]);
    expect(preview.destination).toBe("null");

    const custom = JSON.parse(
      issuer.buildBurn({ from: ref("nftIssuer"), symbol: "CARD", id: ["1", "2"], account: "graveyard" })
        .json,
    );
    expect(custom.contractPayload.to).toBe("graveyard");
    expect(custom.contractPayload.nfts).toEqual([{ symbol: "CARD", ids: ["1", "2"] }]);
  });

  it("emits the same protocol payload as the Keychain path", () => {
    const input = { symbol: "CARD", account: "alice", feeSymbol: "ENG" };
    const backend = JSON.parse(
      new NftIssuer(makeContext()).buildIssue({ from: ref("nftIssuer"), ...input }).json,
    );
    expect(backend).toEqual(new NftActionBuilder().buildIssue(input));
  });
});
