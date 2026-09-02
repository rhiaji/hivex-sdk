import { HiveSdkError } from "../types/index";
import { NodeSelector, type NodeSelectorOptions } from "./NodeSelector";
import {
  DEFAULT_RPC_ENDPOINT,
  type DynamicGlobalProperties,
  type HiveBlock,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./types";

export interface RpcClientOptions extends NodeSelectorOptions {
  /** Maximum endpoints tried per call (default 3: beacon top-1, default, next beacon node). */
  maxAttempts?: number;
}

/**
 * Generic Hive JSON-RPC client with node resolution and failover.
 *
 * Endpoint order (unless an explicit endpoint override is passed):
 *   Beacon top node -> default endpoint -> next Beacon node not tried yet.
 */
export class RpcClient {
  private readonly selector: NodeSelector;
  private readonly maxAttempts: number;
  private requestId = 0;

  constructor(endpoint?: string | RpcClientOptions) {
    const options: RpcClientOptions =
      typeof endpoint === "string" || endpoint === undefined ? { ...(endpoint ? { endpoint } : {}) } : endpoint;

    this.selector = new NodeSelector(options);
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  }

  /** Endpoint currently selected (override, active node, or the default failover). */
  get endpoint(): string {
    return this.selector.activeEndpoint;
  }

  /** Endpoint used as failover when a Beacon-selected node fails. */
  get fallbackEndpoint(): string {
    return this.selector.fallbackEndpoint;
  }

  /** Drop failure history so the next call re-runs Beacon discovery. */
  resetEndpoint(): void {
    this.selector.reset();
  }

  /**
   * Perform a JSON-RPC 2.0 POST call, retrying on another node when the
   * selected endpoint is unreachable or returns a transport error.
   *
   * @example const props = await rpc.call("condenser_api.get_dynamic_global_properties", []);
   */
  async call<T = unknown>(
    method: string,
    params: unknown = [],
    options?: { signal?: AbortSignal },
  ): Promise<T> {
    if (typeof method !== "string" || method.trim() === "") {
      throw new HiveSdkError("VALIDATION_ERROR", "RPC method must be a non-empty string");
    }

    this.requestId += 1;
    const body: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params: params ?? [],
      id: this.requestId,
    };

    let endpoint = await this.selector.resolve(options);
    let lastError: unknown;

    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      try {
        return await this.callEndpoint<T>(endpoint, body, options);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        const transportFailure =
          error instanceof HiveSdkError && error.code === "HTTP_ERROR";
        if (!transportFailure || !this.selector.canFailover) throw error;

        lastError = error;
        const next = await this.selector.rotate(endpoint, options);
        if (!next) break;
        endpoint = next;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new HiveSdkError("HTTP_ERROR", "All Hive RPC endpoints failed", lastError);
  }

  private async callEndpoint<T>(
    endpoint: string,
    body: JsonRpcRequest,
    options?: { signal?: AbortSignal },
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        ...(options?.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new HiveSdkError(
        "HTTP_ERROR",
        `Network request to ${endpoint} failed: ${(error as Error).message}`,
        error,
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new HiveSdkError(
        "HTTP_ERROR",
        `RPC endpoint ${endpoint} returned HTTP ${response.status} ${response.statusText}`,
        text,
      );
    }

    let json: JsonRpcResponse<T>;
    try {
      json = (await response.json()) as JsonRpcResponse<T>;
    } catch (error) {
      throw new HiveSdkError("RPC_ERROR", "RPC response was not valid JSON", error);
    }

    if (json.error) {
      throw new HiveSdkError(
        "RPC_ERROR",
        json.error.message ?? `RPC method ${body.method} failed`,
        json.error,
      );
    }

    if (json.result === undefined) {
      throw new HiveSdkError("RPC_ERROR", `RPC method ${body.method} returned no result`, json);
    }

    return json.result;
  }

  /** Current chain properties (head block, irreversible block, time). */
  async getDynamicGlobalProperties(options?: {
    signal?: AbortSignal;
  }): Promise<DynamicGlobalProperties> {
    return this.call<DynamicGlobalProperties>(
      "condenser_api.get_dynamic_global_properties",
      [],
      options,
    );
  }

  /** Head block number. */
  async getHeadBlockNumber(options?: { signal?: AbortSignal }): Promise<number> {
    const props = await this.getDynamicGlobalProperties(options);
    return props.head_block_number;
  }

  /** Fetch a single block, or null when it does not exist yet. */
  async getBlock(
    blockNumber: number,
    options?: { signal?: AbortSignal },
  ): Promise<HiveBlock | null> {
    const block = await this.call<HiveBlock | null>(
      "condenser_api.get_block",
      [blockNumber],
      options,
    );
    return block ?? null;
  }
}

export { DEFAULT_RPC_ENDPOINT };
