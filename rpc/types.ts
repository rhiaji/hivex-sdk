/** JSON-RPC and Hive block shapes. */

export const DEFAULT_RPC_ENDPOINT = "https://api.hive.blog";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: unknown;
  id: number;
}

export interface JsonRpcErrorBody {
  code?: number;
  message?: string;
  data?: unknown;
}

export interface JsonRpcResponse<T> {
  jsonrpc?: string;
  id?: number;
  result?: T;
  error?: JsonRpcErrorBody;
}

/** condenser_api operation tuple: ["custom_json", { ... }] */
export type CondenserOperation = [string, Record<string, unknown>];

/** *_api operation object: { type: "custom_json_operation", value: { ... } } */
export interface ApiOperation {
  type: string;
  value: Record<string, unknown>;
}

export type HiveOperation = CondenserOperation | ApiOperation;

export interface HiveTransaction {
  operations: HiveOperation[];
  [key: string]: unknown;
}

export interface HiveBlock {
  block_id?: string;
  previous?: string;
  timestamp: string;
  transactions: HiveTransaction[];
  transaction_ids?: string[];
  [key: string]: unknown;
}

export interface DynamicGlobalProperties {
  head_block_number: number;
  last_irreversible_block_num: number;
  time: string;
  [key: string]: unknown;
}
