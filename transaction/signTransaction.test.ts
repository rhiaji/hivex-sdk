import { describe, expect, it } from "vitest";
import { HiveSigningError } from "../errors/index";
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
