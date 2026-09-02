import type { HiveAccountConfig, HiveConfig } from "../configs/types";
import type { EnvironmentResolver } from "../environment/types";
import type { TransactionSigner } from "../signer/types";

/** Options accepted by the HiveClient constructor. */
export interface HiveClientOptions<
  TAccounts extends Record<string, HiveAccountConfig> = Record<string, HiveAccountConfig>,
  TConfigs extends Record<string, HiveConfig> = Record<string, HiveConfig>,
> extends Omit<HiveConfig, "accounts"> {
  /** Account aliases of the default (root) configuration context. */
  accounts?: TAccounts;
  /**
   * RPC endpoint override. Part of the RPC system, not of configurations —
   * omit it to use the default node / Beacon discovery.
   */
  endpoint?: string;
  /** Beacon node-health API URL. */
  beaconUrl?: string;
  /** Additional named configurations declared up front. */
  configs?: TConfigs;
  /**
   * Runtime-independent environment access. Defaults to a safe resolver that
   * reads `process.env` when it exists (Node, Bun, Workers with node compat).
   */
  environment?: EnvironmentResolver;
  /** Signing strategy installed on the signer. */
  signer?: TransactionSigner;
}
