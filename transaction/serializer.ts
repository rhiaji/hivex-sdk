import { HiveSdkError } from "../types/index";
import { isPlainObject } from "../utils/validation";
import type { UnsignedTransaction } from "./types";

/**
 * Binary serialization of the Hive transaction envelope.
 *
 * Only the operations this SDK produces are serializable: `custom_json`
 * (issuer, protocol and Layer 2 payments) and `transfer` (native payments).
 * Anything else is rejected loudly instead of being silently mis-signed.
 */
const OPERATION_IDS: Record<string, number> = {
  transfer: 2,
  custom_json: 18,
};

/** Precision of the native Hive assets. */
const ASSET_PRECISION: Record<string, number> = {
  HIVE: 3,
  HBD: 3,
  VESTS: 6,
};

class ByteWriter {
  private chunks: number[] = [];

  bytes(value: Uint8Array): this {
    for (const byte of value) this.chunks.push(byte);
    return this;
  }

  uint8(value: number): this {
    this.chunks.push(value & 0xff);
    return this;
  }

  uint16(value: number): this {
    this.chunks.push(value & 0xff, (value >>> 8) & 0xff);
    return this;
  }

  uint32(value: number): this {
    this.chunks.push(
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    );
    return this;
  }

  int64(value: bigint): this {
    let remaining = value;
    for (let index = 0; index < 8; index += 1) {
      this.chunks.push(Number(remaining & 0xffn));
      remaining >>= 8n;
    }
    return this;
  }

  varint(value: number): this {
    let remaining = value;
    while (remaining >= 0x80) {
      this.chunks.push((remaining & 0x7f) | 0x80);
      remaining >>>= 7;
    }
    this.chunks.push(remaining);
    return this;
  }

  string(value: string): this {
    const encoded = new TextEncoder().encode(value);
    this.varint(encoded.length);
    return this.bytes(encoded);
  }

  stringArray(values: string[]): this {
    this.varint(values.length);
    for (const value of values) this.string(value);
    return this;
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.chunks);
  }
}

function invalid(message: string, raw?: unknown): never {
  throw new HiveSdkError("VALIDATION_ERROR", message, raw);
}

/** `"1.234 HIVE"` -> amount (int64) + precision + 7-byte symbol. */
function writeAsset(writer: ByteWriter, amount: string): void {
  if (typeof amount !== "string") invalid("An asset amount must be a string like \"1.000 HIVE\"");
  const match = amount.trim().match(/^(\d+)(?:\.(\d+))?\s+([A-Z]{1,7})$/);
  if (!match) invalid(`Invalid asset amount "${amount}"`);

  const [, whole, fraction = "", symbol] = match as unknown as [string, string, string, string];
  const precision = ASSET_PRECISION[symbol];
  if (precision === undefined) invalid(`Unsupported asset symbol "${symbol}"`);
  if (fraction.length > precision) {
    invalid(`Asset "${amount}" has more than ${precision} decimal places`);
  }

  const padded = fraction.padEnd(precision, "0");
  writer.int64(BigInt(`${whole}${padded}`));
  writer.uint8(precision);

  const symbolBytes = new Uint8Array(7);
  symbolBytes.set(new TextEncoder().encode(symbol));
  writer.bytes(symbolBytes);
}

function writeTransfer(writer: ByteWriter, body: Record<string, unknown>): void {
  writer.string(String(body["from"] ?? invalid("transfer.from is required")));
  writer.string(String(body["to"] ?? invalid("transfer.to is required")));
  writeAsset(writer, body["amount"] as string);
  writer.string(typeof body["memo"] === "string" ? body["memo"] : "");
}

function writeCustomJson(writer: ByteWriter, body: Record<string, unknown>): void {
  const requiredAuths = (body["required_auths"] ?? []) as string[];
  const requiredPostingAuths = (body["required_posting_auths"] ?? []) as string[];
  if (!Array.isArray(requiredAuths) || !Array.isArray(requiredPostingAuths)) {
    invalid("custom_json authorities must be arrays");
  }
  writer.stringArray(requiredAuths);
  writer.stringArray(requiredPostingAuths);
  writer.string(String(body["id"] ?? invalid("custom_json.id is required")));
  writer.string(typeof body["json"] === "string" ? body["json"] : JSON.stringify(body["json"]));
}

function writeOperation(writer: ByteWriter, operation: unknown): void {
  if (!Array.isArray(operation) || operation.length !== 2) {
    invalid("An operation must be a [name, body] tuple", operation);
  }
  const [name, body] = operation as [unknown, unknown];
  if (typeof name !== "string") invalid("An operation name must be a string", operation);
  if (!isPlainObject(body)) invalid(`Operation "${name}" has an invalid body`, operation);

  const operationId = OPERATION_IDS[name];
  if (operationId === undefined) {
    invalid(
      `Operation "${name}" cannot be signed by this SDK. Supported operations: ${Object.keys(
        OPERATION_IDS,
      ).join(", ")}`,
    );
  }

  writer.varint(operationId);
  if (name === "transfer") writeTransfer(writer, body);
  else writeCustomJson(writer, body);
}

/** Unix seconds of a chain expiration timestamp (`2024-01-01T00:00:00`). */
function expirationSeconds(expiration: string): number {
  const iso = expiration.endsWith("Z") ? expiration : `${expiration}Z`;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) invalid(`Invalid transaction expiration "${expiration}"`);
  return Math.floor(parsed / 1000);
}

/** Serialize a transaction exactly as the Hive consensus layer expects it. */
export function serializeTransaction(transaction: UnsignedTransaction): Uint8Array {
  const writer = new ByteWriter();
  writer.uint16(transaction.ref_block_num);
  writer.uint32(transaction.ref_block_prefix);
  writer.uint32(expirationSeconds(transaction.expiration));

  const operations = transaction.operations;
  if (!Array.isArray(operations) || operations.length === 0) {
    invalid("A transaction must carry at least one operation");
  }
  writer.varint(operations.length);
  for (const operation of operations) writeOperation(writer, operation);

  writer.varint(0); // extensions
  return writer.toBytes();
}
