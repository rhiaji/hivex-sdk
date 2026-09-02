import { HiveSdkError } from "../../types/index";
import { isPlainObject } from "../../utils/validation";

/** Default Hive Engine JSON-RPC endpoints. */
export const ENGINE_BLOCKCHAIN_RPC = "https://api.hive-engine.com/rpc/blockchain";
export const ENGINE_CONTRACTS_RPC = "https://api.hive-engine.com/rpc/contracts";

export interface EngineRpcOptions {
  /** Blockchain endpoint used for `getTransactionInfo`. */
  blockchainUrl?: string;
  /** Contracts endpoint used for contract reads. */
  contractsUrl?: string;
  /** Injectable fetch, mainly for tests. */
  fetchFn?: typeof fetch;
  /** Request timeout in ms. Default 10000. */
  timeoutMs?: number;
}

/** Raw Hive Engine transaction info, as returned by the sidechain node. */
export interface EngineTransactionInfo {
  blockNumber?: number;
  transactionId?: string;
  sender?: string;
  contract?: string;
  action?: string;
  payload?: string;
  /** JSON string: `{ "errors": [...] }` or `{ "events": [...] }`. */
  logs?: string;
  [key: string]: unknown;
}

/**
 * Minimal client for the Hive Engine sidechain RPC.
 *
 * Layer 2 execution is NOT guaranteed by Hive block inclusion, so reading the
 * sidechain execution logs is the only way to know whether a token transfer
 * actually succeeded.
 */
export class EngineRpcClient {
  private readonly blockchainUrl: string;
  private readonly contractsUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private requestId = 0;

  constructor(options: EngineRpcOptions = {}) {
    this.blockchainUrl = options.blockchainUrl ?? ENGINE_BLOCKCHAIN_RPC;
    this.contractsUrl = options.contractsUrl ?? ENGINE_CONTRACTS_RPC;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  /** Execution record of a Hive Engine transaction, or null when unknown yet. */
  async getTransactionInfo(transactionId: string): Promise<EngineTransactionInfo | null> {
    const result = await this.call(this.blockchainUrl, "getTransactionInfo", {
      txid: transactionId,
    });
    return isPlainObject(result) ? (result as EngineTransactionInfo) : null;
  }

  /** Generic contracts-endpoint read. */
  async findOne<T = unknown>(params: Record<string, unknown>): Promise<T | null> {
    const result = await this.call(this.contractsUrl, "findOne", params);
    return (result ?? null) as T | null;
  }

  private async call(url: string, method: string, params: unknown): Promise<unknown> {
    this.requestId += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: this.requestId, method, params }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new HiveSdkError(
          "RPC_ERROR",
          `Hive Engine RPC responded with HTTP ${response.status}`,
          { method },
        );
      }
      const body = (await response.json()) as Record<string, unknown>;
      if (isPlainObject(body["error"])) {
        throw new HiveSdkError("RPC_ERROR", `Hive Engine RPC error on "${method}"`, body["error"]);
      }
      return body["result"];
    } catch (error) {
      if (error instanceof HiveSdkError) throw error;
      throw new HiveSdkError("RPC_ERROR", `Hive Engine RPC request "${method}" failed`, {
        message: (error as Error)?.message,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
