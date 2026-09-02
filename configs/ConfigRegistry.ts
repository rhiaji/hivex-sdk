import { HiveSdkError } from "../types/index";
import { HiveConfigurationError } from "../errors/index";
import { isPlainObject } from "../utils/validation";
import { assertNonEmptyString } from "../utils/validation";
import { validateAccountConfig } from "./AccountResolver";
import { ConfigContext, type ConfigContextRuntime } from "./ConfigContext";
import type { HiveConfig, HiveConfigSummary } from "./types";

/**
 * Immutable registry of named configurations.
 *
 * Configurations are declared once when the client is created. The registry
 * never persists anything and never resolves environment variables or private
 * keys: registration performs shape validation only.
 */
export class ConfigRegistry {
  private readonly configs = new Map<string, HiveConfig>();
  private readonly contexts = new Map<string, ConfigContext>();
  private readonly runtime: ConfigContextRuntime;

  /**
   * Configurations are declarative: everything is registered once, here, and
   * the registry is read-only afterwards.
   */
  constructor(runtime: ConfigContextRuntime, configs: Record<string, HiveConfig> = {}) {
    this.runtime = runtime;
    for (const [name, config] of Object.entries(configs)) {
      assertNonEmptyString(name, "name");
      if (this.configs.has(name)) {
        throw new HiveSdkError("CONFIG_EXISTS", `Configuration "${name}" already exists`, { name });
      }
      validateConfig(config ?? {});
      this.configs.set(name, { ...(config ?? {}) });
    }

    // Statically declared configurations are also reachable by property
    // access: `hive.configs.game`. Reserved method names are never shadowed.
    for (const name of this.configs.keys()) {
      if (name in ConfigRegistry.prototype || name in this) continue;
      Object.defineProperty(this, name, {
        enumerable: true,
        get: () => this.use(name),
      });
    }
  }

  /** Raw configuration object. Throws when unknown. */
  get(name: string): HiveConfig {
    const config = this.configs.get(name);
    if (!config) {
      throw new HiveSdkError("CONFIG_NOT_FOUND", `Configuration "${name}" not found`, { name });
    }
    return config;
  }

  has(name: string): boolean {
    return this.configs.has(name);
  }

  /** Get an independent configuration context bound to this configuration. */
  use(name: string): ConfigContext {
    const config = this.get(name);
    let context = this.contexts.get(name);
    if (!context) {
      context = new ConfigContext(name, config, this.runtime);
      this.contexts.set(name, context);
    }
    return context;
  }

  /** Safe summaries of every configuration. Never includes key material. */
  list(): HiveConfigSummary[] {
    return [...this.configs.keys()].map((name) => this.use(name).summary());
  }

  /** Configuration names only. */
  names(): string[] {
    return [...this.configs.keys()];
  }
}

function validateConfig(config: HiveConfig): void {
  if (!isPlainObject(config as unknown)) {
    throw new HiveConfigurationError("Configuration must be an object");
  }
  for (const forbidden of ["endpoint", "rpcEndpoint", "rpcUrl", "nodeUrl"]) {
    if ((config as Record<string, unknown>)[forbidden] !== undefined) {
      throw new HiveConfigurationError(
        `Configurations do not control RPC nodes: remove "${forbidden}". ` +
          `RPC endpoints are handled by the RPC system (Beacon discovery, default nodes, fallback).`,
        { property: forbidden },
      );
    }
  }
  if (config.accounts !== undefined) {
    if (!isPlainObject(config.accounts)) {
      throw new HiveConfigurationError(`"accounts" must be an object of aliases`);
    }
    for (const [alias, entry] of Object.entries(config.accounts)) {
      validateAccountConfig(alias, entry);
    }
  }
  if (config.metadata !== undefined && !isPlainObject(config.metadata)) {
    throw new HiveConfigurationError(`"metadata" must be an object`);
  }
  if (config.options !== undefined && !isPlainObject(config.options)) {
    throw new HiveConfigurationError(`"options" must be an object`);
  }
}
