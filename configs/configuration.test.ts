import { describe, expect, it, vi } from "vitest";
import { HiveClient } from "../core/HiveClient";
import { isAccountReference } from "./AccountReference";
import { createEnvironmentResolver } from "../environment/EnvironmentResolver";
import {
  HiveAccountNotFoundError,
  HiveConfigurationError,
  HiveEnvironmentVariableMissingError,
  HiveSigningKeyMissingError,
} from "../errors/index";
import type { TransactionSigner } from "../signer/types";

const env = createEnvironmentResolver({
  HIVE_TREASURY_ACCOUNT: "treasuryaccount",
  HIVE_TREASURY_KEY: "5JsecretKeyValue",
  HIVE_EMPTY: "   ",
});

function client(configs: Record<string, unknown> = {}, signer?: TransactionSigner) {
  return new HiveClient({
    environment: env,
    ...(signer ? { signer } : {}),
    configs: configs as never,
  });
}

describe("account configuration validation", () => {
  it("requires exactly one of account / accountEnv", () => {
    expect(() => client({ a: { accounts: { x: {} } } })).toThrow(HiveConfigurationError);
    expect(() =>
      client({ a: { accounts: { x: { account: "a", accountEnv: "HIVE_TREASURY_ACCOUNT" } } } }),
    ).toThrow(HiveConfigurationError);
  });

  it("allows at most one of key / keyEnv", () => {
    expect(() =>
      client({ a: { accounts: { x: { account: "a", key: "k", keyEnv: "HIVE_TREASURY_KEY" } } } }),
    ).toThrow(HiveConfigurationError);
  });

  it("rejects RPC endpoints inside configurations", () => {
    expect(() => client({ a: { endpoint: "https://api.hive.blog" } })).toThrow(
      HiveConfigurationError,
    );
  });

  it("never echoes an invalid key value back", () => {
    try {
      client({ a: { accounts: { x: { account: "a", key: "" } } } });
      throw new Error("expected throw");
    } catch (caught) {
      expect((caught as Error).message).not.toContain("5J");
      expect((caught as Error).message).toContain("x");
    }
  });
});

describe("account resolution", () => {
  it("resolves direct account values without key material", () => {
    const hive = client({ prod: { accounts: { issuer: { account: "tokenissuer" } } } });
    const resolved = hive.configs.use("prod").resolveAccount("issuer");
    expect(resolved).toEqual({ alias: "issuer", account: "tokenissuer" });
    expect(JSON.stringify(resolved)).not.toContain("key");
  });

  it("resolves accounts from environment references", () => {
    const hive = client({
      prod: { accounts: { treasury: { accountEnv: "HIVE_TREASURY_ACCOUNT" } } },
    });
    expect(hive.configs.use("prod").resolveAccount("treasury").account).toBe("treasuryaccount");
  });

  it("throws for missing environment variables", () => {
    const hive = client({ prod: { accounts: { t: { accountEnv: "HIVE_NOT_SET" } } } });
    expect(() => hive.configs.use("prod").resolveAccount("t")).toThrow(
      HiveEnvironmentVariableMissingError,
    );
  });

  it("treats blank environment values as missing", () => {
    const hive = client({ prod: { accounts: { t: { accountEnv: "HIVE_EMPTY" } } } });
    expect(() => hive.configs.use("prod").resolveAccount("t")).toThrow(
      HiveEnvironmentVariableMissingError,
    );
  });

  it("throws for unknown aliases", () => {
    const hive = client({ prod: { accounts: {} } });
    expect(() => hive.configs.use("prod").resolveAccount("nope")).toThrow(
      HiveAccountNotFoundError,
    );
  });

  it("is lazy — nothing is read until an alias is used", () => {
    const get = vi.fn(() => "treasuryaccount");
    const hive = new HiveClient({
      environment: { get },
      configs: { prod: { accounts: { t: { accountEnv: "HIVE_TREASURY_ACCOUNT" } } } },
    });
    expect(get).not.toHaveBeenCalled();
    hive.configs.use("prod").resolveAccount("t");
    expect(get).toHaveBeenCalledWith("HIVE_TREASURY_ACCOUNT");
  });

  it("supports multiple configurations and aliases pointing at the same account", () => {
    const hive = client({
      a: { accounts: { one: { account: "shared" }, two: { account: "shared" } } },
      b: { accounts: { one: { account: "other" } } },
    });
    expect(hive.configs.use("a").resolveAccount("two").account).toBe("shared");
    expect(hive.configs.use("b").resolveAccount("one").account).toBe("other");
    expect(hive.configs.names()).toEqual(["default", "a", "b"]);
  });
});

describe("signing credentials", () => {
  it("frontend configurations need no keys", () => {
    const hive = client({ web: { accounts: { user: { account: "someuser" } } } });
    const summary = hive.configs.use("web").summary();
    expect(summary.accountAliases).toEqual(["user"]);
    expect(summary.signingAliases).toEqual([]);
  });

  it("throws when a signing key is not configured", () => {
    const hive = client({ web: { accounts: { user: { account: "someuser" } } } });
    expect(() => hive.configs.use("web").resolveSigningAccount("user")).toThrow(
      HiveSigningKeyMissingError,
    );
  });

  it("resolves a backend signing key lazily from the environment", () => {
    const hive = client({
      api: {
        accounts: {
          treasury: { accountEnv: "HIVE_TREASURY_ACCOUNT", keyEnv: "HIVE_TREASURY_KEY" },
        },
      },
    });
    const signing = hive.configs.use("api").resolveSigningAccount("treasury");
    expect(signing.account).toBe("treasuryaccount");
    expect(signing.key).toBe("5JsecretKeyValue");
  });

  it("keeps keys out of configuration summaries", () => {
    const hive = client({
      api: { accounts: { treasury: { account: "t", keyEnv: "HIVE_TREASURY_KEY" } } },
    });
    const summaries = JSON.stringify(hive.configs.list());
    expect(summaries).not.toContain("5JsecretKeyValue");
    expect(summaries).toContain("treasury");
  });

  it("passes the resolved key to the injected signer only at sign time", async () => {
    const sign = vi.fn(async (_request: unknown, _key?: string) => ({
      transaction: {},
      signatures: ["sig"],
    }));
    const strategy: TransactionSigner = { name: "test", sign };
    const hive = client(
      { api: { accounts: { treasury: { account: "t", keyEnv: "HIVE_TREASURY_KEY" } } } },
      strategy,
    );
    const signing = hive.configs.use("api").resolveSigningAccount("treasury");
    await hive.signer.sign({
      account: signing.account,
      alias: signing.alias,
      key: signing.key,
      transaction: { operations: [] },
    });
    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign.mock.calls[0]?.[1]).toBe("5JsecretKeyValue");
  });

  it("refuses to sign without a resolved key", async () => {
    const strategy: TransactionSigner = {
      name: "test",
      sign: async () => ({ transaction: {} }),
    };
    const hive = client({}, strategy);
    await expect(
      hive.signer.sign({ account: "t", transaction: { operations: [] } }),
    ).rejects.toThrow(HiveSigningKeyMissingError);
  });
});

describe("registry immutability", () => {
  it("exposes read-only access only", () => {
    const hive = client({ prod: { accounts: { issuer: { account: "tokenissuer" } } } });
    const registry = hive.configs as unknown as Record<string, unknown>;
    for (const method of ["create", "set", "update", "remove"]) {
      expect(registry[method]).toBeUndefined();
    }
    expect(hive.configs.has("prod")).toBe(true);
    expect(hive.configs.get("prod").accounts?.["issuer"]?.account).toBe("tokenissuer");
  });
});

describe("account references", () => {
  it("exposes key-free references on the client and named configurations", () => {
    const client = new HiveClient({
      accounts: { treasury: { account: "treasury-acc", keyEnv: "TREASURY_KEY" } },
      configs: { game: { accounts: { minter: { accountEnv: "MINTER_ACCOUNT" } } } },
    });

    const treasury = client.accounts["treasury"]!;
    expect(treasury).toMatchObject({ alias: "treasury", config: "default", signing: true });
    expect(JSON.stringify(treasury)).not.toContain("treasury-acc");
    expect(isAccountReference(treasury)).toBe(true);

    const minter = client.configs.use("game").accounts["minter"]!;
    expect(minter).toMatchObject({ alias: "minter", config: "game", accountEnv: "MINTER_ACCOUNT" });
    expect(minter.signing).toBe(false);
  });

  it("rejects alias strings and cross-configuration references", () => {
    const client = new HiveClient({
      accounts: { treasury: { account: "treasury-acc" } },
      configs: { game: { accounts: { minter: { account: "minter-acc" } } } },
    });

    const mint = { symbol: "TOKEN", account: "bob", quantity: "1" };
    expect(() =>
      client.issuer.token.buildMint({ ...mint, from: "treasury" as never }),
    ).toThrow(/account reference/i);
    expect(() =>
      client.issuer.token.buildMint({ ...mint, from: client.configs.use("game").accounts["minter"]! }),
    ).toThrow(/configuration/i);
  });
});
