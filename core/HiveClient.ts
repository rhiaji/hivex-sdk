import { BeaconClient } from "../beacon/BeaconClient";
import { AccountResolver } from "../configs/AccountResolver";
import { createAccountReference, type AccountReference } from "../configs/AccountReference";
import type { HiveAccountConfig, HiveConfig, ResolvedAccount } from "../configs/types";
import { validateAccountConfig } from "../configs/AccountResolver";
import { defaultEnvironmentResolver } from "../environment/EnvironmentResolver";
import type { EnvironmentResolver } from "../environment/types";
import { HiveConfigurationError } from "../errors/index";
import { HiveAccountNotFoundError } from "../errors/index";
import { IssuerClient } from "../issuer/IssuerClient";
import { KeychainClient } from "../keychain/KeychainClient";
import { KeychainIssuer } from "../keychain/KeychainIssuer";
import { CustomJsonParser } from "../parser/CustomJsonParser";
import { PaymentClient } from "../payments/PaymentClient";
import { EnginePaymentValidator } from "../payments/engine/EnginePaymentValidator";
import { EngineRpcClient } from "../payments/engine/EngineRpcClient";
import { RpcClient } from "../rpc/RpcClient";
import { ReaderClient } from "../reader/ReaderClient";
import { BlockStreamer } from "../stream/BlockStreamer";
import { BlockWatcher } from "../stream/BlockWatcher";
import { CustomJsonWatcher } from "../stream/CustomJsonWatcher";
import { CustomJsonBuilder } from "../transaction/CustomJsonBuilder";
import { TransactionAssembler } from "../transaction/TransactionAssembler";
import { isPlainObject } from "../utils/validation";
import { RUNTIME_OPTION_KEYS, type HiveClientOptions } from "./types";

/**
 * Account references keyed by the statically declared aliases when the config
 * literal is known, otherwise a generic record.
 */
type AccountReferences<TConfig extends HiveConfig> = TConfig["accounts"] extends Record<
  string,
  HiveAccountConfig
>
  ? string extends keyof TConfig["accounts"]
    ? Record<string, AccountReference>
    : { readonly [K in keyof TConfig["accounts"]]: AccountReference }
  : Record<string, AccountReference>;

/** The developer configuration, minus the SDK runtime options. */
export type HiveConfigs<TConfig extends HiveConfig> = Readonly<
  Omit<TConfig, (typeof RUNTIME_OPTION_KEYS)[number]>
>;

/**
 * Public entry point.
 *
 *   const hive = new HiveClient(config);
 *   hive.configs   // exactly the configuration you passed, deeply frozen
 *
 * The SDK stores configuration; it does not manage environments. There is no
 * active configuration, no configuration context and no runtime switching:
 * create one client per configuration when you need more than one.
 */
export class HiveClient<TConfig extends HiveConfig = HiveConfig> {
  /** The developer-defined configuration, exactly as provided and frozen. */
  public readonly configs: HiveConfigs<TConfig>;

  /**
   * Key-free account references for the declared aliases.
   * Backend operations take these objects: `from: hive.accounts.treasury`.
   */
  public readonly accounts: AccountReferences<TConfig>;
  public readonly environment: EnvironmentResolver;

  public readonly endpoint: string;
  public readonly rpc: RpcClient;
  public readonly builder: CustomJsonBuilder;
  public readonly parser: CustomJsonParser;
  public readonly keychain: KeychainClient;
  /** Browser token/NFT operations through Hive Keychain — no keys, no configuration. */
  public readonly keychainIssuer: KeychainIssuer;
  /** Core block stream: hive.blocks.watch(). */
  public readonly blocks: BlockWatcher;
  /** hive.customJson.parse() and hive.customJson.watch(). */
  public readonly customJson: CustomJsonWatcher;
  public readonly reader: ReaderClient;
  public readonly beacon: BeaconClient;
  public readonly assembler: TransactionAssembler;
  public readonly issuer: IssuerClient;
  public readonly payments: PaymentClient;

  private readonly resolver: AccountResolver;

  constructor(options: HiveClientOptions<TConfig> = {} as HiveClientOptions<TConfig>) {
    if (!isPlainObject(options as unknown)) {
      throw new HiveConfigurationError("Configuration must be an object");
    }

    const { endpoint, beaconUrl, environment } = options as HiveClientOptions<HiveConfig>;

    const config: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(options)) {
      if ((RUNTIME_OPTION_KEYS as readonly string[]).includes(key)) continue;
      config[key] = freezeDeep(cloneDeep(value));
    }

    const accountConfigs = (config["accounts"] ?? {}) as Record<string, HiveAccountConfig>;
    if (!isPlainObject(accountConfigs)) {
      throw new HiveConfigurationError(`"accounts" must be an object of aliases`);
    }
    for (const [alias, entry] of Object.entries(accountConfigs)) {
      validateAccountConfig(alias, entry);
    }

    this.configs = Object.freeze(config) as HiveConfigs<TConfig>;
    this.environment = environment ?? defaultEnvironmentResolver;
    this.resolver = new AccountResolver(accountConfigs, this.environment);

    const references: Record<string, AccountReference> = {};
    for (const [alias, entry] of Object.entries(accountConfigs)) {
      references[alias] = createAccountReference(alias, entry);
    }
    this.accounts = Object.freeze(references) as AccountReferences<TConfig>;

    this.beacon = new BeaconClient(beaconUrl);
    this.rpc = new RpcClient({
      ...(endpoint ? { endpoint } : {}),
      beacon: this.beacon,
    });
    this.endpoint = this.rpc.endpoint;
    this.builder = new CustomJsonBuilder();
    this.parser = new CustomJsonParser();
    this.keychain = new KeychainClient(this.builder);
    this.keychainIssuer = new KeychainIssuer(this.keychain);
    this.assembler = new TransactionAssembler(this.rpc);

    const applicationId = config["applicationId"];
    const issuerContext = {
      rpc: this.rpc,
      keychain: this.keychain,
      builder: this.builder,
      resolveAccount: (alias: string) => this.resolver.resolve(alias),
      resolveSigningAccount: (alias: string) => this.resolver.resolveSigning(alias),
      ...(typeof applicationId === "string" ? { applicationId } : {}),
    };
    this.issuer = new IssuerClient(issuerContext);

    const engineValidator = new EnginePaymentValidator(new EngineRpcClient({}));
    this.reader = new ReaderClient({ rpc: this.rpc, parser: this.parser, engineValidator });
    this.blocks = new BlockWatcher(new BlockStreamer(this.rpc));
    this.customJson = new CustomJsonWatcher(this.parser, (streamOptions) =>
      this.reader.stream(streamOptions),
    );
    this.payments = new PaymentClient({
      rpc: this.rpc,
      issuer: issuerContext,
      engineValidator,
      createStream: (streamOptions) => this.reader.stream(streamOptions),
    });
  }

  /** Key-free reference for one alias. Throws when the alias is unknown. */
  account(alias: string): AccountReference {
    const reference = (this.accounts as Record<string, AccountReference>)[alias];
    if (!reference) throw new HiveAccountNotFoundError(alias);
    return reference;
  }

  /** Every declared account alias. */
  listAccounts(): string[] {
    return this.resolver.list();
  }

  /** Safe alias resolution. Never returns key material. */
  resolveAccount(alias: string): ResolvedAccount {
    return this.resolver.resolve(alias);
  }
}

function cloneDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneDeep(item)) as unknown as T;
  if (isPlainObject(value as unknown)) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      copy[key] = cloneDeep(item);
    }
    return copy as T;
  }
  return value;
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}
