import { writeFileSync } from "node:fs";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { HiveClient, HiveSdkError } from "../index";
import { HiveSigningError } from "../errors/index";
import {
  TEST_WIF as SYNTHETIC_WIF,
  CHAIN_ID,
  assertSignedFixture,
  checkPublicTransfer,
  engineFixture,
  makeClient,
  mockRpc,
  nativeFixtures,
  unsignedFixture,
  vestsFixture,
} from "../test-support/native-signing.mjs";
import { serializeTransaction } from "./serializer";
import { HIVE_CHAIN_ID, signTransaction, transactionDigest } from "./signTransaction";
import type { UnsignedTransaction } from "./types";

const TEST_WIF = "5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ";

const transaction = (): UnsignedTransaction => ({
  ref_block_num: 1234,
  ref_block_prefix: 987654321,
  expiration: "2024-01-01T00:00:00",
  operations: [
    [
      "custom_json",
      {
        required_auths: ["issuer-account"],
        required_posting_auths: [],
        id: "my-app",
        json: JSON.stringify({ action: "issue", metadata: {} }),
      },
    ],
  ],
  extensions: [],
});

describe("transaction signing", () => {
  it("serializes a transaction deterministically", () => {
    expect(Buffer.from(serializeTransaction(transaction())).toString("hex")).toEqual(
      Buffer.from(serializeTransaction(transaction())).toString("hex"),
    );
  });

  it("mixes the Hive chain id into the digest", () => {
    expect(HIVE_CHAIN_ID).toHaveLength(64);
    const digest = transactionDigest(transaction());
    expect(digest).toBeInstanceOf(Uint8Array);
    expect(digest).toHaveLength(32);
  });

  it("produces a canonical signature and leaves the transaction intact", () => {
    const unsigned = transaction();
    const signed = signTransaction(unsigned, TEST_WIF);

    expect(signed.signatures).toHaveLength(1);
    expect(signed.signatures[0]).toMatch(/^[0-9a-f]{130}$/);
    expect(signed.operations).toEqual(unsigned.operations);
    expect("signatures" in unsigned).toBe(false);

    // deterministic (RFC6979) — same input, same signature
    expect(signTransaction(transaction(), TEST_WIF).signatures).toEqual(signed.signatures);
  });

  it("rejects an invalid WIF key", () => {
    expect(() => signTransaction(transaction(), "not-a-key")).toThrow(HiveSigningError);
  });
});

describe("legacy asset signing bytes", () => {
  it.each([...nativeFixtures, vestsFixture])("encodes $amount $symbol as literal consensus bytes", (fixture) => {
    const unsigned = unsignedFixture(fixture);
    const original = structuredClone(unsigned);
    const bytes = serializeTransaction(unsigned);
    expect(Buffer.from(bytes).toString("hex")).toBe(fixture.hex);
    // Header + operation tag + length-prefixed alice/bob occupy 22 bytes.
    expect(Buffer.from(bytes.subarray(22, 38)).toString("hex")).toBe(fixture.assetHex);
    expect(Buffer.from(transactionDigest(unsigned)).toString("hex")).toBe(fixture.digest);
    assertSignedFixture(signTransaction(unsigned, SYNTHETIC_WIF), fixture);
    expect(unsigned).toEqual(original);
    expect(HIVE_CHAIN_ID).toBe(CHAIN_ID);
  });

  it.each([
    [nativeFixtures[0], "7.5 HIVE"],
    [nativeFixtures[3], "0.5 HBD"],
    [vestsFixture, "1 VESTS"],
  ])("preserves fractional padding for %s", (fixture, amount) => {
    const unsigned = unsignedFixture(fixture);
    unsigned.operations[0][1].amount = amount;
    expect(Buffer.from(serializeTransaction(unsigned)).toString("hex")).toBe(fixture.hex);
  });

  it("preserves integer amounts beyond Number.MAX_SAFE_INTEGER", () => {
    const unsigned = unsignedFixture(nativeFixtures[0]);
    unsigned.operations[0][1].amount = "9007199254740.993 HIVE";
    expect(Buffer.from(serializeTransaction(unsigned).subarray(22, 38)).toString("hex"))
      .toBe("010000000000200003535445454d0000");
  });

  it.each(["1.000 STEEM", "1.000 SBD", "1.000 UNKNOWN", "1.0001 HIVE", "1.0000001 VESTS", "invalid"])(
    "rejects invalid serialized assets: %s", (amount) => {
      const unsigned = unsignedFixture(nativeFixtures[0]);
      unsigned.operations[0][1].amount = amount;
      expect(() => serializeTransaction(unsigned)).toThrow(HiveSdkError);
    },
  );
});

describe("public payment signing with no network", () => {
  const captures: unknown[] = [];
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => {
    // Optional external-verifier artifact; all tests always run without this variable.
    if (process.env["HIVEX_SIGNING_CAPTURE_FILE"]) {
      writeFileSync(process.env["HIVEX_SIGNING_CAPTURE_FILE"], JSON.stringify(captures, null, 2));
    }
  });

  it.each(nativeFixtures)("independently verifies the public $amount $symbol transfer", async (fixture) => {
    captures.push(await checkPublicTransfer(HiveClient, fixture));
  });

  it("independently verifies a public Engine custom_json transfer as a control", async () => {
    captures.push(await checkPublicTransfer(HiveClient, engineFixture));
  });

  it.each([
    { label: "numeric amount", override: { amount: 1 } },
    { label: "negative amount", override: { amount: "-1.000" } },
    { label: "scientific notation", override: { amount: "1e3" } },
    { label: "excess precision", override: { amount: "0.0001" } },
    { label: "legacy HIVE symbol", override: { symbol: "STEEM" } },
    { label: "legacy HBD symbol", override: { symbol: "SBD" } },
    { label: "non-payment VESTS symbol", override: { symbol: "VESTS" } },
    { label: "unsupported symbol", override: { symbol: "BTC" } },
    { label: "empty recipient", override: { account: "" } },
    { label: "blank action", override: { action: " " } },
    { label: "invalid metadata", override: { metadata: 42 } },
    { label: "oversized memo", override: { metadata: { text: "x".repeat(2048) } } },
  ])("rejects $label before making any RPC request", async ({ override }) => {
    const rpc = mockRpc(nativeFixtures[0]);
    vi.stubGlobal("fetch", rpc.fetch);
    const hive = makeClient(HiveClient);
    await expect(hive.payments.hive.transfer({
      from: hive.accounts.treasury, account: "bob", amount: "1.000", symbol: "HIVE",
      action: "purchase", metadata: { orderId: "A-1" }, ...override,
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(rpc.requests).toEqual([]);
    expect(rpc.transactions).toEqual([]);
  });

  it.each(["not-a-key", `${SYNTHETIC_WIF.slice(0, -1)}e`])("rejects an invalid key without broadcasting: %s", async (key) => {
    const rpc = mockRpc(nativeFixtures[0]);
    vi.stubGlobal("fetch", rpc.fetch);
    const hive = makeClient(HiveClient, key);
    await expect(hive.payments.hive.transfer({
      from: hive.accounts.treasury, account: "bob", amount: "1.000", symbol: "HIVE", action: "purchase",
    })).rejects.toThrow(HiveSigningError);
    expect(rpc.requests.map(({ method }) => method)).toEqual(["condenser_api.get_dynamic_global_properties"]);
    expect(rpc.transactions).toEqual([]);
  });

  it("rejects missing signing credentials before making any RPC request", async () => {
    const rpc = mockRpc(nativeFixtures[0]);
    vi.stubGlobal("fetch", rpc.fetch);
    const hive = new HiveClient({ endpoint: "https://signing-test.invalid", accounts: { treasury: { account: "alice" } } });
    await expect(hive.payments.hive.transfer({
      from: hive.accounts.treasury, account: "bob", amount: "1.000", symbol: "HIVE", action: "purchase",
    })).rejects.toMatchObject({ code: "SIGNING_KEY_MISSING" });
    expect(rpc.requests).toEqual([]);
  });
});
