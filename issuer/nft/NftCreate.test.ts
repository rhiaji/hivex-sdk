import { describe, expect, it, vi } from "vitest";
import { HiveSdkError } from "../../types/index";
import { createAccountReference } from "../../configs/AccountReference";
import type { IssuerContext } from "../IssuerDispatcher";
import { NftActionBuilder } from "../../engine/NftActionBuilder";
import { NftIssuer } from "./NftIssuer";

const TEST_WIF = "5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ";
const ref = (alias: string) => createAccountReference(alias, {});

function makeContext(call = vi.fn()): IssuerContext {
  return {
    rpc: { call } as unknown as IssuerContext["rpc"],
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
    ...{},
  };
}

const base = { name: "Test Collection", symbol: "TESTNFT" };

describe("server NFT creation", () => {
  it("builds the same payload as the pure builder", () => {
    const issuer = new NftIssuer(makeContext());
    const preview = issuer.buildCreate({ from: ref("nftIssuer"), ...base, maxSupply: "1000" });
    expect(JSON.parse(preview.json)).toEqual(
      new NftActionBuilder().buildCreate({ ...base, maxSupply: "1000" }),
    );
    expect(preview.account).toBe("issuer-account");
  });

  it("validates before touching the network", () => {
    const issuer = new NftIssuer(makeContext());
    expect(() => issuer.buildCreate({ from: ref("nftIssuer"), ...base, symbol: "bad" })).toThrow(
      /uppercase/,
    );
  });

  it("checkCreate reads the resolved signing account", async () => {
    const issuer = new NftIssuer(makeContext());
    const check = vi
      .spyOn(issuer.creation, "check")
      .mockResolvedValue({ ok: true } as never);
    await issuer.checkCreate({ from: ref("nftIssuer"), ...base });
    expect(check).toHaveBeenCalledWith({ account: "issuer-account", symbol: "TESTNFT" });
  });

  it("blocks create() when the preflight fails and never broadcasts", async () => {
    const call = vi.fn();
    const issuer = new NftIssuer(makeContext(call));
    vi.spyOn(issuer.creation, "assertCanCreate").mockRejectedValue(
      new HiveSdkError("INSUFFICIENT_BEE", "not enough BEE"),
    );
    await expect(issuer.create({ from: ref("nftIssuer"), ...base })).rejects.toMatchObject({
      code: "INSUFFICIENT_BEE",
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("skipChecks bypasses the preflight", async () => {
    const issuer = new NftIssuer(makeContext());
    const assertCanCreate = vi.spyOn(issuer.creation, "assertCanCreate");
    vi.spyOn(
      issuer as unknown as { signAndBroadcast: () => Promise<unknown> },
      "signAndBroadcast",
    ).mockResolvedValue({ success: true, raw: null });
    await issuer.create({ from: ref("nftIssuer"), ...base, skipChecks: true });
    expect(assertCanCreate).not.toHaveBeenCalled();
  });
});
