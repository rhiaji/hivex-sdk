import assert from "node:assert/strict";
import { createHash, createPublicKey, verify } from "node:crypto";

// Public, synthetic scalar-1 credentials. Never fund these accounts or use this key.
export const TEST_WIF = "5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf";
export const PUBLIC_KEY_HEX = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
export const CHAIN_ID = "beeab0de00000000000000000000000000000000000000000000000000000000";
export const ENDPOINT = "https://signing-test.invalid";
export const MEMO = '{"action":"purchase","metadata":{"orderId":"A-1"}}';

// Literal protocol fixtures, independently checked against the reference at:
// https://gitlab.syncad.com/hive/dhive/-/tree/9de526c0fa35fb4f9b38e09578ac0289661945b0
// Expected bytes must never be generated with the SDK serializer under test.
export const nativeFixtures = [
  {
    amount: "7.500", symbol: "HIVE",
    assetHex: "4c1d00000000000003535445454d0000",
    hex: "d204b168de3a80009265010205616c69636503626f624c1d00000000000003535445454d0000327b22616374696f6e223a227075726368617365222c226d65746164617461223a7b226f726465724964223a22412d31227d7d00",
    digest: "662fe4afb989ec9a2acc44f5a428fdea3301ad892dcd3ac64889fc2ca523126a",
    transactionId: "f8e1bc3f5c828543b14542c156c87efdb275a3b2",
  },
  {
    amount: "0.500", symbol: "HIVE",
    assetHex: "f40100000000000003535445454d0000",
    hex: "d204b168de3a80009265010205616c69636503626f62f40100000000000003535445454d0000327b22616374696f6e223a227075726368617365222c226d65746164617461223a7b226f726465724964223a22412d31227d7d00",
    digest: "8e48ed155c5c95221ab13d2630478b42b1023c39c5a8c168d1a97b1b09ef591c",
    transactionId: "3f5145977404e7b060734f6b29a6ced45981b969",
  },
  {
    amount: "0.005", symbol: "HIVE",
    assetHex: "050000000000000003535445454d0000",
    hex: "d204b168de3a80009265010205616c69636503626f62050000000000000003535445454d0000327b22616374696f6e223a227075726368617365222c226d65746164617461223a7b226f726465724964223a22412d31227d7d00",
    digest: "65f5538354e39bd72340e7843e27eb4f86bced4afe744c7557a2aa8a1cb57001",
    transactionId: "97f4b8d6e80e30668eb4b4e79b58e1e9dae960ee",
  },
  {
    amount: "0.500", symbol: "HBD",
    assetHex: "f4010000000000000353424400000000",
    hex: "d204b168de3a80009265010205616c69636503626f62f4010000000000000353424400000000327b22616374696f6e223a227075726368617365222c226d65746164617461223a7b226f726465724964223a22412d31227d7d00",
    digest: "971e4f6a779a4e7d9cbfc438ae9f348598845dea774747ba55e4dd29da20956a",
    transactionId: "596c6a1d958c91c47cc9ef1bd1b08a73eaf5d00e",
  },
];

export const vestsFixture = {
  amount: "1.000000", symbol: "VESTS",
  assetHex: "40420f00000000000656455354530000",
  hex: "d204b168de3a80009265010205616c69636503626f6240420f00000000000656455354530000327b22616374696f6e223a227075726368617365222c226d65746164617461223a7b226f726465724964223a22412d31227d7d00",
  digest: "03359788383fd5346f21fb9099ed1ce8f85423ce5d3a3acb402aa34abfd8fec3",
  transactionId: "a4654680e4c43b6b0d980f7536ec6072dd3fc475",
};

export const engineFixture = {
  engine: true, amount: "1.000", symbol: "SWAP.HIVE",
  hex: "d204b168de3a8000926501120105616c69636500107373632d6d61696e6e65742d68697665c2017b22636f6e74726163744e616d65223a22746f6b656e73222c22636f6e7472616374416374696f6e223a227472616e73666572222c22636f6e74726163745061796c6f6164223a7b2273796d626f6c223a22535741502e48495645222c22746f223a22626f62222c227175616e74697479223a22312e303030222c226d656d6f223a227b5c22616374696f6e5c223a5c2270757263686173655c222c5c226d657461646174615c223a7b5c226f7264657249645c223a5c22412d315c227d7d227d7d00",
  digest: "5acc46d88648675573305837420414ec9f21a6bd3513ee278c2489724b8c2396",
  transactionId: "ced03eaec581c5eca8ce68d9a3fdc7dd09b24f2e",
};

export function unsignedFixture(fixture) {
  const operation = fixture.engine
    ? ["custom_json", {
        required_auths: ["alice"], required_posting_auths: [], id: "ssc-mainnet-hive",
        json: JSON.stringify({
          contractName: "tokens", contractAction: "transfer",
          contractPayload: { symbol: "SWAP.HIVE", to: "bob", quantity: "1.000", memo: MEMO },
        }),
      }]
    : ["transfer", { from: "alice", to: "bob", amount: `${fixture.amount} ${fixture.symbol}`, memo: MEMO }];
  return {
    ref_block_num: 1234, ref_block_prefix: 987654321, expiration: "2024-01-01T00:00:00",
    operations: [operation], extensions: [],
  };
}

export function makeClient(HiveClient, key = TEST_WIF) {
  return new HiveClient({ endpoint: ENDPOINT, accounts: { treasury: { account: "alice", key } } });
}

/** Every fetch is intercepted, including broadcast; no real transport is retained here. */
export function mockRpc(fixture) {
  const requests = [];
  const transactions = [];
  const raw = { id: fixture.transactionId, block_num: 1235, trx_num: 0, expired: false };
  const fetch = async (url, options) => {
    assert.equal(String(url), ENDPOINT, "Unexpected endpoint (including discovery)");
    assert.equal(options.method, "POST");
    const request = JSON.parse(options.body);
    assert.equal(request.jsonrpc, "2.0");
    assert.equal(request.id, requests.length + 1);
    requests.push(request);
    let result;
    switch (request.method) {
      case "condenser_api.get_dynamic_global_properties":
        assert.deepEqual(request.params, []);
        result = {
          head_block_number: 1234,
          head_block_id: "000004d2b168de3a000000000000000000000000",
          time: "2023-12-31T23:59:00",
        };
        break;
      case "condenser_api.broadcast_transaction_synchronous":
        assert.equal(request.params.length, 1);
        transactions.push(request.params[0]);
        result = raw;
        break;
      default:
        assert.fail(`Unexpected RPC call: ${request.method}`);
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
  };
  return { fetch, requests, transactions, raw };
}

export function assertSignedFixture(signed, fixture) {
  const { signatures, ...unsigned } = signed;
  assert.deepEqual(unsigned, unsignedFixture(fixture));
  assert.equal(signatures.length, 1);
  assert.match(signatures[0], /^[0-9a-f]{130}$/);
  const signature = Buffer.from(signatures[0], "hex");
  assert.ok(signature[0] >= 31 && signature[0] <= 34, "Compressed recovery header");
  for (const offset of [1, 33]) {
    assert.equal(signature[offset] & 0x80, 0, "Canonical positive integer");
    assert.ok(signature[offset] !== 0 || (signature[offset + 1] & 0x80) !== 0, "Canonical padding");
  }

  const bytes = Buffer.from(fixture.hex, "hex");
  const message = Buffer.concat([Buffer.from(CHAIN_ID, "hex"), bytes]);
  assert.equal(createHash("sha256").update(message).digest("hex"), fixture.digest);
  assert.equal(createHash("sha256").update(bytes).digest("hex").slice(0, 40), fixture.transactionId);
  const key = createPublicKey({
    key: Buffer.from(`3036301006072a8648ce3d020106052b8104000a032200${PUBLIC_KEY_HEX}`, "hex"),
    format: "der", type: "spki",
  });
  // OpenSSL hashes independent literal signing bytes once; no SDK digest or crypto is used.
  assert.equal(verify("sha256", message, { key, dsaEncoding: "ieee-p1363" }, signature.subarray(1)), true);
  const tampered = Buffer.from(message);
  tampered[tampered.length - 1] ^= 1;
  assert.equal(verify("sha256", tampered, { key, dsaEncoding: "ieee-p1363" }, signature.subarray(1)), false);
}

export async function checkPublicTransfer(HiveClient, fixture) {
  const originalFetch = globalThis.fetch;
  const rpc = mockRpc(fixture);
  globalThis.fetch = rpc.fetch;
  try {
    const hive = makeClient(HiveClient);
    const input = {
      from: hive.accounts.treasury, account: "bob", symbol: fixture.symbol,
      action: "purchase", metadata: { orderId: "A-1" },
      ...(fixture.engine ? { quantity: fixture.amount } : { amount: fixture.amount }),
    };
    const originalInput = JSON.stringify(input);
    const client = fixture.engine ? hive.payments.engine : hive.payments.hive;
    const preview = client.build(input);
    assert.deepEqual(preview.operation, unsignedFixture(fixture).operations[0]);
    assert.equal(rpc.requests.length, 0, "Preview must remain offline");
    const result = await client.transfer(input);
    assert.equal(JSON.stringify(input), originalInput);
    assert.deepEqual(rpc.requests.map(({ method }) => method), [
      "condenser_api.get_dynamic_global_properties", "condenser_api.broadcast_transaction_synchronous",
    ]);
    assert.equal(rpc.transactions.length, 1);
    const signed = rpc.transactions[0];
    assertSignedFixture(signed, fixture);
    assert.deepEqual(result, { success: true, transactionId: fixture.transactionId, account: "bob", raw: rpc.raw });
    return {
      label: `${fixture.amount} ${fixture.symbol}`, transaction: signed,
      expectedHex: fixture.hex, expectedDigest: fixture.digest, expectedId: fixture.transactionId,
      expectedPublicKeyHex: PUBLIC_KEY_HEX,
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}
