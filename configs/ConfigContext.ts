import { BeaconClient } from "../beacon/BeaconClient";
import { IssuerClient } from "../issuer/IssuerClient";
import { KeychainClient } from "../keychain/KeychainClient";
import { CustomJsonParser } from "../parser/CustomJsonParser";
import { PaymentClient } from "../payments/PaymentClient";
import { RpcClient } from "../rpc/RpcClient";
import { EnginePaymentValidator } from "../payments/engine/EnginePaymentValidator";
import { EngineRpcClient } from "../payments/engine/EngineRpcClient";
import { ReaderClient } from "../reader/ReaderClient";
import type { Signer } from "../signer/Signer";
import { BlockStreamer } from "../stream/BlockStreamer";
import { BlockWatcher } from "../stream/BlockWatcher";
import { CustomJsonWatcher } from "../stream/CustomJsonWatcher";
import { CustomJsonBuilder } from "../transaction/CustomJsonBuilder";
import { TransactionAssembler } from "../transaction/TransactionAssembler";
import type { EnvironmentResolver } from "../environment/types";
import { HiveAccountNotFoundError } from "../errors/index";
import { AccountResolver } from "./AccountResolver";
import { createAccountReference, type AccountReference } from "./AccountReference";
import type {
  HiveConfig,
  HiveConfigSummary,
  ResolvedAccount,
  ResolvedSigningAccount,
} from "./types";

/** Runtime dependencies shared by every configuration context. */
export interface ConfigContextRuntime {
  signer: Signer;
  environment: EnvironmentResolver;
  /** RPC system settings — owned by the RPC layer, not by configurations. */
  endpoint?: string;
  beaconUrl?: string;
}

/**
 * One immutable, independent view over a single named configuration.
 *
 * The context owns account aliases and account resolution. It does NOT own RPC
 * node selection: endpoints come from the RPC system (Beacon discovery,
 * default nodes, fallback).
 */
export class ConfigContext {
  public readonly name: string;
  public readonly metadata: Record<string, unknown>;
  public readonly options: Record<string, unknown>;
  public readonly endpoint: string;

  public readonly rpc: RpcClient;
  public readonly builder: CustomJsonBuilder;
  public readonly parser: CustomJsonParser;
  public readonly keychain: KeychainClient;
  /** Core block stream — the single blockchain reading foundation. */
  public readonly blocks: BlockWatcher;
  /** Custom JSON parsing plus a filtered view of the block stream. */
  public readonly customJson: CustomJsonWatcher;
  /** Transaction reads and the unified stream engine. */
  public readonly reader: ReaderClient;
  public readonly beacon: BeaconClient;
  public readonly assembler: TransactionAssembler;
  public readonly issuer: IssuerClient;
  /** Native + Layer 2 payments with standardized triggers. */
  public readonly payments: PaymentClient;
  public readonly signer: Signer;

  /**
   * Key-free account references, one per declared alias. Backend operations
   * take these objects directly: `from: context.accounts.treasury`.
   */
  public readonly accounts: Readonly<Record<string, AccountReference>>;

  private readonly snapshot: HiveConfig;
  private readonly resolver: AccountResolver;

  constructor(name: string, config: HiveConfig, runtime: ConfigContextRuntime) {
    this.name = name;
    this.snapshot = deepFreeze(structuredCloneSafe(config));
    this.metadata = this.snapshot.metadata ?? {};
    this.options = this.snapshot.options ?? {};
    this.signer = runtime.signer;

    this.resolver = new AccountResolver(name, this.snapshot.accounts ?? {}, runtime.environment);

    this.beacon = new BeaconClient(runtime.beaconUrl);
    this.rpc = new RpcClient({
      ...(runtime.endpoint ? { endpoint: runtime.endpoint } : {}),
      beacon: this.beacon,
    });
    this.endpoint = this.rpc.endpoint;
    this.builder = new CustomJsonBuilder();
    this.parser = new CustomJsonParser();
    this.keychain = new KeychainClient(this.builder);

    this.assembler = new TransactionAssembler(this.rpc);

    const references: Record<string, AccountReference> = {};
    for (const [alias, entry] of Object.entries(this.snapshot.accounts ?? {})) {
      references[alias] = createAccountReference(name, alias, entry);
    }
    this.accounts = Object.freeze(references);

    const applicationId = this.options["applicationId"];
    const issuerContext = {
      rpc: this.rpc,
      keychain: this.keychain,
      signer: this.signer,
      builder: this.builder,
      configName: name,
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

  /** Read-only view of the configuration snapshot (no resolved secrets). */
  get config(): HiveConfig {
    return this.snapshot;
  }

  /** Key-free reference for one alias. Throws when the alias is unknown. */
  account(alias: string): AccountReference {
    const reference = this.accounts[alias];
    if (!reference) throw new HiveAccountNotFoundError(alias, this.name);
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

  /**
   * Internal signing-credential resolution. Used by the signing path only;
   * treat the returned key as short-lived and never log or persist it.
   *
   * @internal
   */
  resolveSigningAccount(alias: string): ResolvedSigningAccount {
    return this.resolver.resolveSigning(alias);
  }

  /** Safe summary for UIs and logs. Never includes key material. */
  summary(): HiveConfigSummary {
    return {
      name: this.name,
      accountAliases: this.listAccounts(),
      signingAliases: this.listAccounts().filter((alias) => this.resolver.hasSigningKey(alias)),
      metadata: this.metadata,
      options: this.options,
    };
  }
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
