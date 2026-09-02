import type { BeaconClient } from "../beacon/BeaconClient";
import { DEFAULT_RPC_ENDPOINT } from "./types";

export interface NodeSelectorOptions {
  /** Hard override. When set, no discovery and no failover happen. */
  endpoint?: string;
  /** Failover endpoint used when the Beacon-selected node fails. */
  fallbackEndpoint?: string;
  /** Beacon client used for live node discovery. */
  beacon?: BeaconClient;
  /** Minimum Beacon score for a candidate node. */
  minScore?: number;
}

/**
 * Resolves which Hive RPC endpoint to use, in this order:
 *
 *   1. Beacon top-ranked healthy node (unless an explicit override is set)
 *   2. The default endpoint, used as failover
 *   3. A fresh Beacon lookup, picking the next best node not tried yet
 *
 * Once a node answers successfully it is kept until it fails again.
 */
export class NodeSelector {
  public readonly override: string | null;
  public readonly fallbackEndpoint: string;

  private readonly beacon: BeaconClient | undefined;
  private readonly minScore: number;
  private readonly tried = new Set<string>();
  private current: string | null = null;

  constructor(options: NodeSelectorOptions = {}) {
    this.override = options.endpoint?.trim() || null;
    this.fallbackEndpoint = options.fallbackEndpoint?.trim() || DEFAULT_RPC_ENDPOINT;
    this.beacon = options.beacon;
    this.minScore = options.minScore ?? 50;
  }

  /** Endpoint currently in use (or the one that will be tried first). */
  get activeEndpoint(): string {
    return this.override ?? this.current ?? this.fallbackEndpoint;
  }

  /** True when failover/retry is possible. */
  get canFailover(): boolean {
    return this.override === null;
  }

  /** Endpoint to use for the next request. */
  async resolve(options?: { signal?: AbortSignal }): Promise<string> {
    if (this.override) return this.override;
    if (this.current) return this.current;

    const best = await this.pickFromBeacon(options);
    this.current = best ?? this.fallbackEndpoint;
    this.tried.add(this.current);
    return this.current;
  }

  /**
   * Mark the given endpoint as failed and resolve the next candidate.
   * Returns null when every strategy is exhausted.
   */
  async rotate(failed: string, options?: { signal?: AbortSignal }): Promise<string | null> {
    if (this.override) return null;
    this.tried.add(failed);
    if (this.current === failed) this.current = null;

    if (!this.tried.has(this.fallbackEndpoint)) {
      this.current = this.fallbackEndpoint;
      this.tried.add(this.current);
      return this.current;
    }

    const next = await this.pickFromBeacon(options);
    if (!next) return null;
    this.current = next;
    this.tried.add(next);
    return next;
  }

  /** Forget failure history and re-run discovery on the next request. */
  reset(): void {
    this.tried.clear();
    this.current = null;
  }

  private async pickFromBeacon(options?: { signal?: AbortSignal }): Promise<string | null> {
    if (!this.beacon) return null;
    try {
      const nodes = await this.beacon.getHealthyNodes({
        minScore: this.minScore,
        limit: 20,
        ...(options?.signal ? { signal: options.signal } : {}),
      });
      return nodes.map((node) => node.endpoint).find((endpoint) => !this.tried.has(endpoint)) ?? null;
    } catch {
      return null;
    }
  }
}
