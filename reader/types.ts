import type { CustomJsonEvent } from "../types/index";

export interface ReadTransactionInput {
  transactionId: string;
  /** Optional Custom JSON id filter. */
  id?: string;
}

export interface TransactionReadResult<T = Record<string, unknown>> {
  transactionId: string;
  blockNumber: number;
  blockTimestamp: string;
  events: CustomJsonEvent<T>[];
  /** Operations that matched the id filter but broke the payload protocol. */
  invalid: { reason: string; raw: unknown }[];
  raw: unknown;
}
