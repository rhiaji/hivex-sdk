import { describe, expect, it, vi } from "vitest";
import { CustomJsonBuilder } from "../../transaction/CustomJsonBuilder";
import { HiveSdkError } from "../../types/index";
import { createAccountReference } from "../../configs/AccountReference";
import type { IssuerContext } from "../IssuerDispatcher";
import { HIVE_ENGINE_CUSTOM_JSON_ID, TokenActionBuilder } from "../../engine/index";
import { TokenIssuer } from "./TokenIssuer";

const TEST_WIF = "5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ";

const ref = (alias: string) => createAccountReference(alias, {});

function makeContext(overrides: Partial<IssuerContext> = {}): IssuerContext {
  return {
    rpc: { call: vi.fn() } as unknown as IssuerContext["rpc"],
    keychain: {} as IssuerContext["keychain"],
    builder: new CustomJsonBuilder(),
    resolveSigningAccount: (alias: string) => ({ alias, account: "treasury-account", key: TEST_WIF }),
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
  it("builds a tokens.issue contract action from the alias", () => {
    const preview = new TokenIssuer(makeContext()).buildIssue(base);

    expect(preview.alias).toBe("treasury");
    expect(preview.account).toBe("treasury-account");
    expect(preview.destination).toBe("alice");
    expect(preview.id).toBe(HIVE_ENGINE_CUSTOM_JSON_ID);
    expect(JSON.parse(preview.json)).toEqual({
      contractName: "tokens",
      contractAction: "issue",
      contractPayload: { symbol: "TOKEN", to: "alice", quantity: "100.000" },
    });

    const operation = preview.operation as [string, { required_auths: string[] }];
    expect(operation[1].required_auths).toEqual(["treasury-account"]);
  });

  it("uses tokens.transfer and burns to null by default", () => {
    const issuer = new TokenIssuer(makeContext());
    expect(JSON.parse(issuer.buildTransfer(base).json).contractAction).toBe("transfer");

    const burn = JSON.parse(
      issuer.buildBurn({ from: ref("treasury"), symbol: "TOKEN", quantity: "5" }).json,
    );
    expect(burn.contractAction).toBe("transfer");
    expect(burn.contractPayload.to).toBe("null");
  });

  it("supports a custom burn destination", () => {
    const issuer = new TokenIssuer(makeContext());
    const preview = issuer.buildBurn({
      from: ref("treasury"),
      symbol: "TOKEN",
      quantity: "5",
      account: "graveyard",
    });
    expect(JSON.parse(preview.json).contractPayload.to).toBe("graveyard");
    expect(preview.destination).toBe("graveyard");
  });

  it("never signs or broadcasts while previewing", () => {
    const call = vi.fn();
    const issuer = new TokenIssuer(
      makeContext({ rpc: { call } as unknown as IssuerContext["rpc"] }),
    );
    issuer.buildIssue(base);
    expect(call).not.toHaveBeenCalled();
  });

  it("validates symbol, account and quantity through the shared validators", () => {
    const issuer = new TokenIssuer(makeContext());
    expect(() => issuer.buildIssue({ ...base, symbol: "token" })).toThrow(HiveSdkError);
    expect(() => issuer.buildIssue({ ...base, account: "" })).toThrow(HiveSdkError);
    expect(() => issuer.buildIssue({ ...base, quantity: 100 as unknown as string })).toThrow(
      /decimal string/,
    );
    expect(() => issuer.buildIssue({ ...base, quantity: "0" })).toThrow(/greater than zero/);
    expect(() => issuer.buildIssue({ ...base, quantity: "-5" })).toThrow(HiveSdkError);
    expect(() => issuer.buildIssue({ ...base, quantity: "10.5e3" })).toThrow(HiveSdkError);
    expect(() => issuer.buildTransfer({ ...base, quantity: "0.001" })).not.toThrow();
  });

  it("surfaces unknown aliases", () => {
    const issuer = new TokenIssuer(makeContext());
    expect(() => issuer.buildIssue({ ...base, from: ref("nope") })).toThrow(/Unknown alias/);
  });

  it("emits the same protocol payload as the Keychain path", () => {
    const backend = JSON.parse(new TokenIssuer(makeContext()).buildTransfer(base).json);
    const keychain = new TokenActionBuilder().buildTransfer({
      symbol: base.symbol,
      account: base.account,
      quantity: base.quantity,
    });
    expect(backend).toEqual(keychain);
  });
});

describe("TokenIssuer signing path", () => {
  it("resolves the key lazily, signs once and broadcasts", async () => {
    const resolveSigningAccount = vi.fn((alias: string) => ({
      alias,
      account: "treasury-account",
      key: TEST_WIF,
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
        rpc: { call } as unknown as IssuerContext["rpc"],
        resolveSigningAccount,
      }),
    );

    // Building a preview must not resolve any key.
    issuer.buildIssue(base);
    expect(resolveSigningAccount).not.toHaveBeenCalled();

    const result = await issuer.issue(base);
    expect(resolveSigningAccount).toHaveBeenCalledTimes(1);
    const broadcast = call.mock.calls.find(
      ([method]) => method === "condenser_api.broadcast_transaction_synchronous",
    );
    const [signed] = (broadcast?.[1] ?? []) as [{ signatures: string[] }];
    expect(signed.signatures).toHaveLength(1);
    expect(result.transactionId).toBe("tx999");
  });
});

describe("TokenIssuer token creation", () => {
  const createBase = {
    from: ref("treasury"),
    symbol: "TOKEN",
    name: "My Token",
    precision: 3,
    maxSupply: "1000000",
  };

  const checker = (overrides: Record<string, unknown> = {}) =>
    ({
      check: vi.fn().mockResolvedValue({
        symbol: "TOKEN",
        account: "treasury-account",
        fee: "100",
        balance: "250",
        hasEnoughBee: true,
        symbolExists: false,
        existingToken: null,
        ok: true,
        issues: [],
      }),
      assertCanCreate: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    }) as unknown as TokenIssuer["creation"];

  it("builds a tokens.create payload identical to the Keychain path", () => {
    const preview = new TokenIssuer(makeContext()).buildCreate({
      ...createBase,
      url: "https://example.com",
    });

    expect(preview.alias).toBe("treasury");
    expect(preview.account).toBe("treasury-account");
    expect(preview.id).toBe(HIVE_ENGINE_CUSTOM_JSON_ID);
    expect(JSON.parse(preview.json)).toEqual(
      new TokenActionBuilder().buildCreate({
        symbol: "TOKEN",
        name: "My Token",
        precision: 3,
        maxSupply: "1000000",
        url: "https://example.com",
      }),
    );
  });

  it("validates symbol, name, precision and max supply", () => {
    const issuer = new TokenIssuer(makeContext());
    expect(() => issuer.buildCreate({ ...createBase, symbol: "token" })).toThrow(HiveSdkError);
    expect(() => issuer.buildCreate({ ...createBase, name: "" })).toThrow(HiveSdkError);
    expect(() => issuer.buildCreate({ ...createBase, precision: 9 })).toThrow(HiveSdkError);
    expect(() => issuer.buildCreate({ ...createBase, maxSupply: "0" })).toThrow(HiveSdkError);
  });

  it("checks the resolved account, not the alias", async () => {
    const issuer = new TokenIssuer(makeContext());
    const creation = checker();
    (issuer as unknown as { creation: unknown }).creation = creation;

    const result = await issuer.checkCreate(createBase);
    expect(result.ok).toBe(true);
    expect((creation as unknown as { check: ReturnType<typeof vi.fn> }).check).toHaveBeenCalledWith({
      account: "treasury-account",
      symbol: "TOKEN",
    });
  });

  it("runs the preflight before signing and broadcasting", async () => {
    const call = vi.fn().mockImplementation((method: string) => {
      if (method === "condenser_api.get_dynamic_global_properties") {
        return Promise.resolve({
          head_block_number: 100,
          head_block_id: "0000006400112233445566778899aabbccddeeff",
          time: "2026-01-01T00:00:00",
        });
      }
      return Promise.resolve({ id: "txcreate" });
    });
    const issuer = new TokenIssuer(
      makeContext({ rpc: { call } as unknown as IssuerContext["rpc"] }),
    );
    const assertCanCreate = vi.fn().mockResolvedValue(undefined);
    (issuer as unknown as { creation: unknown }).creation = checker({ assertCanCreate });

    const result = await issuer.create(createBase);
    expect(assertCanCreate).toHaveBeenCalledWith({
      account: "treasury-account",
      symbol: "TOKEN",
    });
    expect(result.transactionId).toBe("txcreate");
  });

  it("never broadcasts when the preflight fails", async () => {
    const call = vi.fn();
    const issuer = new TokenIssuer(
      makeContext({ rpc: { call } as unknown as IssuerContext["rpc"] }),
    );
    (issuer as unknown as { creation: unknown }).creation = checker({
      assertCanCreate: vi
        .fn()
        .mockRejectedValue(new HiveSdkError("INSUFFICIENT_BEE", "not enough BEE")),
    });

    await expect(issuer.create(createBase)).rejects.toThrow(/not enough BEE/);
    expect(call).not.toHaveBeenCalled();
  });

  it("skips the preflight with skipChecks", async () => {
    const call = vi.fn().mockImplementation((method: string) => {
      if (method === "condenser_api.get_dynamic_global_properties") {
        return Promise.resolve({
          head_block_number: 100,
          head_block_id: "0000006400112233445566778899aabbccddeeff",
          time: "2026-01-01T00:00:00",
        });
      }
      return Promise.resolve({ id: "txskip" });
    });
    const issuer = new TokenIssuer(
      makeContext({ rpc: { call } as unknown as IssuerContext["rpc"] }),
    );
    const assertCanCreate = vi.fn();
    (issuer as unknown as { creation: unknown }).creation = checker({ assertCanCreate });

    const result = await issuer.create({ ...createBase, skipChecks: true });
    expect(assertCanCreate).not.toHaveBeenCalled();
    expect(result.transactionId).toBe("txskip");
  });
});
