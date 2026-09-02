import type { BeaconClient } from "../beacon/BeaconClient";
import { ConfigRegistry } from "../configs/ConfigRegistry";
import type { ConfigContext } from "../configs/ConfigContext";
import { DEFAULT_CONFIG_NAME, type HiveAccountConfig, type HiveConfig } from "../configs/types";
import type { AccountReference } from "../configs/AccountReference";
import { defaultEnvironmentResolver } from "../environment/EnvironmentResolver";
import type { EnvironmentResolver } from "../environment/types";
import type { IssuerClient } from "../issuer/IssuerClient";
import type { KeychainClient } from "../keychain/KeychainClient";
import type { CustomJsonParser } from "../parser/CustomJsonParser";
import type { PaymentClient } from "../payments/PaymentClient";
import type { RpcClient } from "../rpc/RpcClient";
import type { ReaderClient } from "../reader/ReaderClient";
import { Signer } from "../signer/Signer";
import type { BlockWatcher } from "../stream/BlockWatcher";
import type { CustomJsonWatcher } from "../stream/CustomJsonWatcher";
import type { CustomJsonBuilder } from "../transaction/CustomJsonBuilder";
import type { HiveClientOptions } from "./types";

/**
 * Public entry point.
 *
 * Architecture:
 *   configs (aliases + env references) -> signer -> rpc / keychain / stream /
 *   reader / issuer
 *
 * Configurations never carry RPC endpoints: node selection belongs to the RPC
 * system (Beacon discovery, default nodes, fallback). Private keys are resolved
 * lazily, only when a backend signing operation needs them.
 */
/** Named configuration contexts, only when the map is statically known. */
type NamedConfigs<T> = string extends keyof T ? unknown : { readonly [K in keyof T]: ConfigContext };

/** Account references, keyed by the statically declared aliases when available. */
type NamedAccounts<T> = string extends keyof T
  ? Record<string, AccountReference>
  : { readonly [K in keyof T]: AccountReference };

export class HiveClient<
  TAccounts extends Record<string, HiveAccountConfig> = Record<string, HiveAccountConfig>,
  TConfigs extends Record<string, HiveConfig> = Record<string, HiveConfig>,
> {
  public readonly signer: Signer;
  public readonly configs: ConfigRegistry & NamedConfigs<TConfigs>;

  /**
   * Key-free account references of the default configuration context.
   * Backend operations take these objects: `from: hive.accounts.treasury`.
   */
  public readonly accounts: NamedAccounts<TAccounts>;
  public readonly environment: EnvironmentResolver;

  /** Context bound to the "default" configuration. */
  public readonly default: ConfigContext;

  public readonly endpoint: string;
  public readonly rpc: RpcClient;
  public readonly builder: CustomJsonBuilder;
  public readonly parser: CustomJsonParser;
  public readonly keychain: KeychainClient;
  /** Core block stream: hive.blocks.watch(). */
  public readonly blocks: BlockWatcher;
  /** hive.customJson.parse() and hive.customJson.watch(). */
  public readonly customJson: CustomJsonWatcher;
  public readonly reader: ReaderClient;
  public readonly beacon: BeaconClient;
  public readonly issuer: IssuerClient;
  public readonly payments: PaymentClient;

  constructor(options: HiveClientOptions<TAccounts, TConfigs> = {}) {
    const {
      configs: extraConfigs,
      signer,
      environment,
      endpoint,
      beaconUrl,
      ...defaultConfig
    } = options;

    this.environment = environment ?? defaultEnvironmentResolver;
    this.signer = new Signer();
    if (signer) this.signer.use(signer);

    this.configs = new ConfigRegistry(
      {
        signer: this.signer,
        environment: this.environment,
        ...(endpoint ? { endpoint } : {}),
        ...(beaconUrl ? { beaconUrl } : {}),
      },
      { [DEFAULT_CONFIG_NAME]: defaultConfig as HiveConfig, ...(extraConfigs ?? {}) },
    ) as ConfigRegistry & NamedConfigs<TConfigs>;
    this.default = this.configs.use(DEFAULT_CONFIG_NAME);
    this.accounts = this.default.accounts as NamedAccounts<TAccounts>;

    // Top-level modules delegate to the default configuration context.
    this.endpoint = this.default.endpoint;
    this.rpc = this.default.rpc;
    this.builder = this.default.builder;
    this.parser = this.default.parser;
    this.keychain = this.default.keychain;
    this.blocks = this.default.blocks;
    this.customJson = this.default.customJson;
    this.reader = this.default.reader;
    this.beacon = this.default.beacon;
    this.issuer = this.default.issuer;
    this.payments = this.default.payments;
  }
}
