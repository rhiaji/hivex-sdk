import { describe, expect, it, vi } from "vitest";
import { CustomJsonBuilder } from "../../transaction/CustomJsonBuilder";
import { HiveSdkError } from "../../types/index";
import { createAccountReference } from "../../configs/AccountReference";
import type { IssuerContext } from "../IssuerDispatcher";
import { TokenIssuer } from "./TokenIssuer";

const ref = (alias: string) => createAccountReference("default", alias, {});

function makeContext(overrides: Partial<IssuerContext> = {}): IssuerContext {
  return {
    rpc: { call: vi.fn() } as unknown as IssuerContext["rpc"],
    keychain: {} as IssuerContext["keychain"],
    signer: { sign: vi.fn() } as unknown as IssuerContext["signer"],
    configName: "default",
    builder: new CustomJsonBuilder(),
    resolveAccount: (alias: string) => {
      if (alias !== "treasury") {
        throw new HiveSdkError("ACCOUNT_ALIAS_NOT_FOUND", `Unknown alias "${alias}"`);
      }
      return { alias, account: "treasury-account" };
    },
    applicationId: "my-app",
    ...overrides,
  };
}

const base = { from: ref("treasury"), symbol: "TOKEN", account: "alice", quantity: "100.000" };

describe("TokenIssuer offline builders", () => {
  it("builds a { action, metadata } operation from the alias", () => {
    const preview = new TokenIssuer(makeContext()).buildMint(base);

    expect(preview.alias).toBe("treasury");
    expect(preview.account).toBe("treasury-account");
    expect(preview.destination).toBe("alice");
    expect(preview.id).toBe("my-app");
    expect(JSON.parse(preview.json)).toEqual({
      action: "token.mint",
      metadata: { symbol: "TOKEN", account: "alice", quantity: "100.000" },
    });

    const operation = preview.operation as [string, { required_auths: string[] }];
    expect(operation[1].required_auths).toEqual(["treasury-account"]);
  });

  it("uses the token.transfer action and burns to null by default", () => {
    const issuer = new TokenIssuer(makeContext());
    expect(JSON.parse(issuer.buildTransfer(base).json).action).toBe("token.transfer");

    const burn = JSON.parse(
      issuer.buildBurn({ from: ref("treasury"), symbol: "TOKEN", quantity: "5" }).json,
    );
    expect(burn.action).toBe("token.transfer");
    expect(burn.metadata.account).toBe("null");
  });

  it("supports a custom burn destination", () => {
    const issuer = new TokenIssuer(makeContext());
    const burn = JSON.parse(
      issuer.buildBurn({ from: ref("treasury"), symbol: "TOKEN", quantity: "5", account: "graveyard" })
        .json,
    );
    expect(burn.metadata.account).toBe("graveyard");
  });

  it("never signs or broadcasts while previewing", () => {
    const sign = vi.fn();
    const call = vi.fn();
    const issuer = new TokenIssuer(
      makeContext({
        signer: { sign } as unknown as IssuerContext["signer"],
        rpc: { call } as unknown as IssuerContext["rpc"],
      }),
    );
    issuer.buildMint(base);
    expect(sign).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it("rejects float quantities and bad symbols", () => {
    const issuer = new TokenIssuer(makeContext());
    expect(() => issuer.buildMint({ ...base, quantity: 100 as unknown as string })).toThrow(
      HiveSdkError,
    );
    expect(() => issuer.buildMint({ ...base, symbol: "token" })).toThrow(HiveSdkError);
  });

  it("requires an application id when none is configured", () => {
    const issuer = new TokenIssuer(makeContext({ applicationId: "" }));
    expect(() => issuer.buildMint(base)).toThrow(/application id/i);
  });

  it("surfaces unknown aliases", () => {
    const issuer = new TokenIssuer(makeContext());
    expect(() => issuer.buildMint({ ...base, from: ref("nope") })).toThrow(/Unknown alias/);
  });
});

describe("TokenIssuer signing path", () => {
  it("resolves the key lazily, signs once and broadcasts", async () => {
    const sign = vi.fn().mockResolvedValue({ transaction: { signatures: ["sig"] } });
    const resolveSigningAccount = vi.fn((alias: string) => ({
      alias,
      account: "treasury-account",
      key: "5Jprivatekey",
    }));
    const call = vi.fn().mockImplementation((method: string) => {
      if (method === "condenser_api.get_dynamic_global_properties") {
        return Promise.resolve({
          head_block_number: 100,
          head_block_id: "0000006400112233445566778899aabbccddeeff",
          time: "2026-01-01T00:00:00",
        });
      }
      return Promise.resolve({ id: "tx999" });
    });

    const issuer = new TokenIssuer(
      makeContext({
        signer: { sign } as unknown as IssuerContext["signer"],
        rpc: { call } as unknown as IssuerContext["rpc"],
        resolveSigningAccount,
      }),
    );

    // Building a preview must not resolve any key.
    issuer.buildMint(base);
    expect(resolveSigningAccount).not.toHaveBeenCalled();

    const result = await issuer.mint(base);
    expect(resolveSigningAccount).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(result.transactionId).toBe("tx999");
  });
});
