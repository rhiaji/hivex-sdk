import type { CustomJsonInput, CustomJsonPayload, HiveAuthority } from "../types/index";

export type { CustomJsonInput, CustomJsonPayload, HiveAuthority };

/** Input required to build a full Hive custom_json operation. */
export interface CustomJsonOperationInput<T = Record<string, unknown>> extends CustomJsonInput<T> {
  username: string;
  id: string;
  authority?: HiveAuthority;
}

/** A ready-to-broadcast Hive custom_json operation body. */
export interface BuiltCustomJsonOperation<T = Record<string, unknown>> {
  required_auths: string[];
  required_posting_auths: string[];
  id: string;
  json: string;
  /** The standardized payload before serialization (for debugging). */
  payload: CustomJsonPayload<T>;
}

/** A Hive transaction envelope, before signatures are attached. */
export interface UnsignedTransaction {
  ref_block_num: number;
  ref_block_prefix: number;
  expiration: string;
  operations: unknown[];
  extensions: unknown[];
  [key: string]: unknown;
}

/** A transaction envelope carrying its signatures, ready to broadcast. */
export interface SignedTransaction extends UnsignedTransaction {
  signatures: string[];
}
