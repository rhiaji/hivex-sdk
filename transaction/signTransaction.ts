import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import * as secp256k1 from "@noble/secp256k1";
import { HiveSigningError } from "../errors/index";
import { serializeTransaction } from "./serializer";
import type { SignedTransaction, UnsignedTransaction } from "./types";

/**
 * Backend transaction signing.
 *
 * Configuration -> account reference -> environment variable -> private key ->
 * signature -> RPC. There is no pluggable signing strategy and no key store:
 * the key arrives with the call and is discarded when it returns.
 *
 * Browser flows never reach this module — they go through Hive Keychain.
 */

/** Hive mainnet chain id, mixed into every transaction digest. */
export const HIVE_CHAIN_ID = "beeab0de00000000000000000000000000000000000000000000000000000000";

// The synchronous noble API needs its hash slots wired once.
secp256k1.hashes.sha256 = sha256;
secp256k1.hashes.hmacSha256 = (key, message) => hmac(sha256, key, message);

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base58Decode(value: string): Uint8Array {
  const digits: number[] = [0];
  for (const character of value) {
    const index = BASE58_ALPHABET.indexOf(character);
    if (index === -1) throw new HiveSigningError("The private key is not valid base58");
    let carry = index;
    for (let position = 0; position < digits.length; position += 1) {
      carry += (digits[position] as number) * 58;
      digits[position] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      digits.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let index = 0; index < value.length && value[index] === "1"; index += 1) digits.push(0);
  return new Uint8Array(digits.reverse());
}

/** Decode a WIF private key into its 32 raw bytes. */
function decodePrivateKey(wif: string): Uint8Array {
  if (typeof wif !== "string" || wif.trim() === "") {
    throw new HiveSigningError("A private key is required to sign a backend transaction");
  }

  const decoded = base58Decode(wif.trim());
  if (decoded.length !== 37) {
    throw new HiveSigningError("The private key has an unexpected length (expected WIF format)");
  }
  if (decoded[0] !== 0x80) {
    throw new HiveSigningError("The private key does not use the expected WIF version byte");
  }

  const payload = decoded.subarray(0, 33);
  const checksum = decoded.subarray(33);
  const expected = sha256(sha256(payload)).subarray(0, 4);
  if (checksum.some((byte, index) => byte !== expected[index])) {
    throw new HiveSigningError("The private key checksum is invalid");
  }

  return payload.subarray(1);
}

/** Hive only accepts canonical signatures. */
function isCanonical(signature: Uint8Array): boolean {
  const r0 = signature[0] as number;
  const r1 = signature[1] as number;
  const s0 = signature[32] as number;
  const s1 = signature[33] as number;
  return (
    (r0 & 0x80) === 0 &&
    !(r0 === 0 && (r1 & 0x80) === 0) &&
    (s0 & 0x80) === 0 &&
    !(s0 === 0 && (s1 & 0x80) === 0)
  );
}

/** sha256(chainId || serialized transaction) — the value that gets signed. */
export function transactionDigest(
  transaction: UnsignedTransaction,
  chainId: string = HIVE_CHAIN_ID,
): Uint8Array {
  const serialized = serializeTransaction(transaction);
  const chain = fromHex(chainId);
  const message = new Uint8Array(chain.length + serialized.length);
  message.set(chain, 0);
  message.set(serialized, chain.length);
  return sha256(message);
}

/**
 * Sign a transaction with a configured backend private key.
 *
 * @param transaction Unsigned envelope from the transaction assembler.
 * @param privateKey  WIF private key resolved from the configuration.
 */
export function signTransaction(
  transaction: UnsignedTransaction,
  privateKey: string,
  chainId: string = HIVE_CHAIN_ID,
): SignedTransaction {
  const secretKey = decodePrivateKey(privateKey);
  const digest = transactionDigest(transaction, chainId);

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const entropy = new Uint8Array(32);
    entropy[0] = attempt;
    const recovered = secp256k1.sign(digest, secretKey, {
      prehash: false,
      format: "recovered",
      ...(attempt > 0 ? { extraEntropy: entropy } : {}),
    });

    // noble returns [recovery, r(32), s(32)] for the recovered format.
    const recovery = recovered[0] as number;
    const compact = recovered.subarray(1);
    if (!isCanonical(compact)) continue;

    const signature = new Uint8Array(65);
    signature[0] = recovery + 31; // 27 + 4 (compressed key)
    signature.set(compact, 1);

    return { ...transaction, signatures: [toHex(signature)] };
  }

  throw new HiveSigningError("Could not produce a canonical signature for this transaction");
}
