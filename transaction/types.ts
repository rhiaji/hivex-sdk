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
