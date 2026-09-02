import type { HiveConfig } from "../configs/types";
import type { EnvironmentResolver } from "../environment/types";

/**
 * Runtime options that belong to the SDK itself rather than to the developer's
 * configuration. They are stripped from `hive.configs`.
 */
export interface HiveRuntimeOptions {
  /**
   * RPC endpoint override. Part of the RPC system, not of configurations —
   * omit it to use the default node / Beacon discovery.
   */
  endpoint?: string;
  /** Beacon node-health API URL. */
  beaconUrl?: string;
  /**
   * Runtime-independent environment access. Defaults to a safe resolver that
   * reads `process.env` when it exists (Node, Bun, Workers with node compat).
   */
  environment?: EnvironmentResolver;
}

/** Reserved keys removed from the stored configuration. */
export const RUNTIME_OPTION_KEYS = ["endpoint", "beaconUrl", "environment"] as const;

/**
 * Options accepted by the HiveClient constructor: the developer's own
 * configuration object plus the SDK runtime options.
 */
export type HiveClientOptions<TConfig extends HiveConfig = HiveConfig> = TConfig &
  HiveRuntimeOptions;
