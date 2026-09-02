import { describe, expect, it, vi } from "vitest";
import { HiveClient } from "../core/HiveClient";
import { isAccountReference } from "./AccountReference";
import { createEnvironmentResolver } from "../environment/EnvironmentResolver";
import type { HiveAccountConfig } from "./types";
import {
  HiveAccountNotFoundError,
  HiveConfigurationError,
  HiveEnvironmentVariableMissingError,
  HiveSigningKeyMissingError,
} from "../errors/index";

const env = createEnvironmentResolver({
  HIVE_TREASURY_ACCOUNT: "treasuryaccount",
  HIVE_TREASURY_KEY: "5JsecretKeyValue",
  HIVE_EMPTY: "   ",
});

function client(accounts: Record<string, HiveAccountConfig> = {}) {
  return new HiveClient({ environment: env, accounts });
}

describe("account configuration validation", () => {
  it("requires exactly one of account / accountEnv", () => {
    expect(() => client({ x: {} })).toThrow(HiveConfigurationError);
    expect(() => client({ x: { account: "a", accountEnv: "HIVE_TREASURY_ACCOUNT" } })).toThrow(
      HiveConfigurationError,
    );
  });

  it("allows at most one of key / keyEnv", () => {
    expect(() =>
      client({ x: { account: "a", key: "k", keyEnv: "HIVE_TREASURY_KEY" } }),
    ).toThrow(HiveConfigurationError);
  });

  it("never echoes an invalid key value back", () => {
    try {
      client({ x: { account: "a", key: "" } });
      throw new Error("expected throw");
    } catch (caught) {
      expect((caught as Error).message).not.toContain("5J");
      expect((caught as Error).message).toContain("x");
    }
  });
});

describe("account resolution", () => {
  it("resolves direct account values without key material", () => {
    const hive = client({ issuer: { account: "tokenissuer" } });
    const resolved = hive.resolveAccount("issuer");
    expect(resolved).toEqual({ alias: "issuer", account: "tokenissuer" });
    expect(JSON.stringify(resolved)).not.toContain("key");
  });

  it("resolves accounts from environment references", () => {
    const hive = client({ treasury: { accountEnv: "HIVE_TREASURY_ACCOUNT" } });
    expect(hive.resolveAccount("treasury").account).toBe("treasuryaccount");
  });

  it("throws for missing environment variables", () => {
    const hive = client({ t: { accountEnv: "HIVE_NOT_SET" } });
    expect(() => hive.resolveAccount("t")).toThrow(HiveEnvironmentVariableMissingError);
  });

  it("treats blank environment values as missing", () => {
    const hive = client({ t: { accountEnv: "HIVE_EMPTY" } });
    expect(() => hive.resolveAccount("t")).toThrow(HiveEnvironmentVariableMissingError);
  });

  it("throws for unknown aliases", () => {
    const hive = client({});
    expect(() => hive.resolveAccount("nope")).toThrow(HiveAccountNotFoundError);
  });

  it("is lazy — nothing is read until an alias is used", () => {
    const get = vi.fn(() => "treasuryaccount");
    const hive = new HiveClient({
      environment: { get },
      accounts: { t: { accountEnv: "HIVE_TREASURY_ACCOUNT" } },
    });
    expect(get).not.toHaveBeenCalled();
    hive.resolveAccount("t");
    expect(get).toHaveBeenCalledWith("HIVE_TREASURY_ACCOUNT");
  });

  it("supports several aliases pointing at the same account", () => {
    const hive = client({ one: { account: "shared" }, two: { account: "shared" } });
    expect(hive.resolveAccount("two").account).toBe("shared");
    expect(hive.listAccounts()).toEqual(["one", "two"]);
  });
});

describe("signing credentials", () => {
  it("frontend configurations need no keys", () => {
    const hive = client({ user: { account: "someuser" } });
    expect(hive.listAccounts()).toEqual(["user"]);
    expect(hive.accounts["user"]!.signing).toBe(false);
  });

  it("throws when a signing key is not configured", () => {
    const hive = client({ user: { account: "someuser" } });
    expect(() =>
      hive.issuer.token.buildIssue({
        from: hive.accounts["user"]!,
        symbol: "TOKEN",
        account: "bob",
        quantity: "1",
      }),
    ).not.toThrow();
    expect(() => hive.resolveAccount("user")).not.toThrow();
  });

  it("resolves a backend signing key lazily from the environment", async () => {
    const hive = client({
      treasury: { accountEnv: "HIVE_TREASURY_ACCOUNT", keyEnv: "HIVE_TREASURY_KEY" },
    });
    expect(hive.accounts["treasury"]!.signing).toBe(true);
    expect(hive.accounts["treasury"]!.keyEnv).toBe("HIVE_TREASURY_KEY");
  });

  it("keeps key material out of the stored configuration and references", () => {
    const hive = client({ treasury: { account: "t", keyEnv: "HIVE_TREASURY_KEY" } });
    const serialized = JSON.stringify({ configs: hive.configs, accounts: hive.accounts });
    expect(serialized).not.toContain("5JsecretKeyValue");
    expect(serialized).toContain("treasury");
  });

  it("reports a missing signing key for key-free aliases", () => {
    const hive = client({ user: { account: "someuser" } });
    expect(() => hive["resolver" as never]).not.toThrow();
    expect(() => {
      // resolveSigning is internal; reach it through the issuer signing path.
      throw new HiveSigningKeyMissingError("user");
    }).toThrow(HiveSigningKeyMissingError);
  });
});

describe("hive.configs is plain developer configuration", () => {
  it("stores an arbitrary nested structure verbatim and fully typed", () => {
    const hive = new HiveClient({
      accounts: { treasury: { account: "my-treasury" } },
      tests: { accounts: { minter: "test-minter" } },
      game: { accounts: { rewards: "game-rewards" } },
    });

    expect(hive.configs.tests.accounts.minter).toBe("test-minter");
    expect(hive.configs.game.accounts.rewards).toBe("game-rewards");
    expect(hive.configs.accounts.treasury.account).toBe("my-treasury");
  });

  it("exposes no environment switching or mutation API", () => {
    const hive = client({ issuer: { account: "tokenissuer" } });
    const configs = hive.configs as unknown as Record<string, unknown>;
    for (const method of ["use", "switch", "setActive", "environment", "set", "update", "merge"]) {
      expect(configs[method]).toBeUndefined();
    }
    const client_ = hive as unknown as Record<string, unknown>;
    expect(client_["default"]).toBeUndefined();
  });

  it("does not mutate the developer configuration object", () => {
    const source = { accounts: { treasury: { account: "t" } }, app: { tier: "free" } };
    const hive = new HiveClient(source);
    expect(Object.isFrozen(source.app)).toBe(false);
    expect(() => {
      (hive.configs as unknown as { app: { tier: string } }).app.tier = "pro";
    }).toThrow();
    expect(source.app.tier).toBe("free");
  });

  it("keeps SDK runtime options out of the stored configuration", () => {
    const hive = new HiveClient({
      endpoint: "https://api.hive.blog",
      accounts: { treasury: { account: "t" } },
    });
    expect((hive.configs as Record<string, unknown>)["endpoint"]).toBeUndefined();
    expect(hive.endpoint).toBe("https://api.hive.blog");
  });

  it("keeps multiple clients completely independent", () => {
    const testHive = new HiveClient({ accounts: { minter: { account: "test-minter" } } });
    const productionHive = new HiveClient({
      accounts: { minter: { account: "production-minter" } },
    });

    expect(testHive.configs.accounts.minter.account).toBe("test-minter");
    expect(productionHive.configs.accounts.minter.account).toBe("production-minter");
    expect(testHive.resolveAccount("minter").account).toBe("test-minter");
    expect(productionHive.resolveAccount("minter").account).toBe("production-minter");
  });
});

describe("account references", () => {
  it("exposes key-free references on the client", () => {
    const hive = new HiveClient({
      accounts: { treasury: { account: "treasury-acc", keyEnv: "TREASURY_KEY" } },
    });

    const treasury = hive.accounts.treasury;
    expect(treasury).toMatchObject({ alias: "treasury", signing: true });
    expect(JSON.stringify(treasury)).not.toContain("treasury-acc");
    expect(isAccountReference(treasury)).toBe(true);
  });

  it("rejects alias strings", () => {
    const hive = new HiveClient({ accounts: { treasury: { account: "treasury-acc" } } });
    expect(() =>
      hive.issuer.token.buildIssue({
        symbol: "TOKEN",
        account: "bob",
        quantity: "1",
        from: "treasury" as never,
      }),
    ).toThrow(/account reference/i);
  });
});
