import type { RpcClient } from "../rpc/RpcClient";
import { HiveSdkError } from "../types/index";
import { isPlainObject } from "../utils/validation";
import type { UnsignedTransaction } from "./types";

/**
 * Assembles an unsigned Hive transaction envelope from live chain properties.
 * Contains no cryptography and never touches private keys.
 */
export class TransactionAssembler {
  private readonly rpc: RpcClient;

  constructor(rpc: RpcClient) {
    this.rpc = rpc;
  }

  async build(
    operations: unknown[],
    options: { expirationSeconds?: number } = {},
  ): Promise<UnsignedTransaction> {
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new HiveSdkError("VALIDATION_ERROR", "At least one operation is required");
    }

    const props = await this.rpc.call<unknown>(
      "condenser_api.get_dynamic_global_properties",
      [],
    );
    if (!isPlainObject(props)) {
      throw new HiveSdkError("RPC_ERROR", "Invalid dynamic global properties response", props);
    }

    const headBlockId = props["head_block_id"];
    const headBlockNumber = props["head_block_number"];
    if (typeof headBlockId !== "string" || typeof headBlockNumber !== "number") {
      throw new HiveSdkError("RPC_ERROR", "Chain properties are missing head block data", props);
    }

    const expirationSeconds = options.expirationSeconds ?? 60;
    const time = typeof props["time"] === "string" ? `${props["time"]}Z` : new Date().toISOString();
    const expiration = new Date(new Date(time).getTime() + expirationSeconds * 1000)
      .toISOString()
      .slice(0, 19);

    return {
      ref_block_num: headBlockNumber & 0xffff,
      ref_block_prefix: refBlockPrefix(headBlockId),
      expiration,
      operations,
      extensions: [],
    };
  }
}

/** Little-endian uint32 read from bytes 4..8 of the head block id. */
export function refBlockPrefix(headBlockId: string): number {
  const slice = headBlockId.slice(8, 16);
  if (slice.length !== 8) {
    throw new HiveSdkError("VALIDATION_ERROR", "Invalid head block id");
  }
  const bytes = slice.match(/../g) as string[];
  return bytes.reduce(
    (acc, byte, index) => acc + parseInt(byte, 16) * 256 ** index,
    0,
  );
}
