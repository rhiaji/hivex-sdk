import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { nativeFixtures, vestsFixture, engineFixture, unsignedFixture } from "../test-support/native-signing.mjs";

// The reference is supplied by absolute path from an isolated, built checkout.
// It is deliberately absent from this package's dependency graph and npm tarball.
const [referenceEntry, ...captureFiles] = process.argv.slice(2);
assert.ok(referenceEntry && captureFiles.length, "Usage: node scripts/verify-signing-reference.mjs <external lib/index-node.js> <captures.json> [...]");
const referenceRequire = createRequire(resolve(referenceEntry));
const { cryptoUtils, PublicKey, Signature } = referenceRequire(resolve(referenceEntry));
const { Types } = referenceRequire("./chain/serializer");
const ByteBuffer = referenceRequire("@ecency/bytebuffer");
globalThis.fetch = () => { throw new Error("Network access is forbidden during signature verification"); };

const fixtures = [...nativeFixtures, vestsFixture, engineFixture];
for (const fixture of fixtures) {
  const transaction = unsignedFixture(fixture);
  const buffer = new ByteBuffer(ByteBuffer.DEFAULT_CAPACITY, ByteBuffer.LITTLE_ENDIAN);
  Types.Transaction(buffer, transaction);
  buffer.flip();
  assert.equal(Buffer.from(buffer.toBuffer()).toString("hex"), fixture.hex);
  assert.equal(cryptoUtils.transactionDigest(transaction).toString("hex"), fixture.digest);
  assert.equal(cryptoUtils.generateTrxId(transaction), fixture.transactionId);
}

let count = 0;
for (const file of captureFiles) {
  const captures = JSON.parse(readFileSync(file, "utf8"));
  assert.ok(captures.length > 0, "Expected captured transactions");
  for (const capture of captures) {
    const transaction = capture.transaction;
    const buffer = new ByteBuffer(ByteBuffer.DEFAULT_CAPACITY, ByteBuffer.LITTLE_ENDIAN);
    Types.Transaction(buffer, transaction);
    buffer.flip();
    assert.equal(Buffer.from(buffer.toBuffer()).toString("hex"), capture.expectedHex);
    const digest = cryptoUtils.transactionDigest(transaction);
    assert.equal(digest.toString("hex"), capture.expectedDigest);
    assert.equal(cryptoUtils.generateTrxId(transaction), capture.expectedId);
    const publicKey = new PublicKey(Buffer.from(capture.expectedPublicKeyHex, "hex"));
    assert.equal(transaction.signatures.length, 1);
    const signature = Signature.fromString(transaction.signatures[0]);
    assert.equal(publicKey.verify(digest, signature), true);
    assert.equal(signature.recover(digest).toString(), publicKey.toString());
    count += 1;
  }
}
console.log(`External reference: ${fixtures.length} literal fixtures checked; ${count} captured transactions serialized, verified, and recovered successfully.`);
