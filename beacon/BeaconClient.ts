import { HiveSdkError } from "../types/index";
import {
  DEFAULT_BEACON_URL,
  type BeaconFetchOptions,
  type BeaconNode,
  type BeaconNodeRaw,
} from "./types";

/**
 * Reads public Hive RPC node health from a Beacon-compatible endpoint.
 * Works in both browser and server runtimes (plain fetch, no Node APIs).
 *
 * const nodes = await beacon.getNodes({ minScore: 90, limit: 10 });
 */
export class BeaconClient {
  public readonly url: string;

  constructor(url: string = DEFAULT_BEACON_URL) {
    this.url = url.trim() || DEFAULT_BEACON_URL;
  }

  /** Fetch and normalize the node list, sorted by score (desc). */
  async getNodes(options: BeaconFetchOptions = {}): Promise<BeaconNode[]> {
    let response: Response;
    try {
      response = await fetch(this.url, {
        headers: { Accept: "application/json" },
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new HiveSdkError(
        "HTTP_ERROR",
        `Beacon request to ${this.url} failed: ${(error as Error).message}`,
        error,
      );
    }

    if (!response.ok) {
      throw new HiveSdkError(
        "HTTP_ERROR",
        `Beacon returned HTTP ${response.status} ${response.statusText}`,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      throw new HiveSdkError("PARSE_ERROR", "Beacon response was not valid JSON", error);
    }

    if (!Array.isArray(json)) {
      throw new HiveSdkError("PARSE_ERROR", "Beacon response was not an array", json);
    }

    const nodes = (json as BeaconNodeRaw[])
      .filter((item) => item && typeof item.endpoint === "string")
      .map<BeaconNode>((item) => ({
        name: item.name ?? item.endpoint,
        endpoint: item.endpoint,
        version: item.version ?? "-",
        score: typeof item.score === "number" ? item.score : 0,
        updatedAt: item.updated_at ?? "",
        success: item.success ?? 0,
        fail: item.fail ?? 0,
        lastBlock: typeof item.lastBlock === "number" ? item.lastBlock : null,
        features: Array.isArray(item.features)
          ? item.features.filter((f): f is string => typeof f === "string")
          : [],
        raw: item,
      }))
      .filter((node) => node.score >= (options.minScore ?? 0))
      .filter((node) =>
        (options.requireFeatures ?? []).every((feature) => node.features.includes(feature)),
      )
      .sort((a, b) => b.score - a.score || (b.lastBlock ?? 0) - (a.lastBlock ?? 0));

    return typeof options.limit === "number" ? nodes.slice(0, options.limit) : nodes;
  }

  /**
   * Nodes considered healthy right now (score >= minScore and a recent block).
   * Defaults to the top 10 working nodes.
   */
  async getHealthyNodes(options: BeaconFetchOptions = {}): Promise<BeaconNode[]> {
    const { limit: _limit, ...rest } = options;
    const nodes = await this.getNodes({ ...rest, minScore: options.minScore ?? 50 });
    const healthy = nodes.filter((node) => node.lastBlock !== null);
    return healthy.slice(0, options.limit ?? 10);
  }

  /** Endpoint of the best-scoring healthy node. */
  async getBestEndpoint(options: BeaconFetchOptions = {}): Promise<string | null> {
    const [best] = await this.getHealthyNodes({ ...options, limit: 1 });
    return best?.endpoint ?? null;
  }
}
