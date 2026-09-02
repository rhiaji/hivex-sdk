import {
  HIVE_ENGINE_AUTHORITY,
  HIVE_ENGINE_CUSTOM_JSON_ID,
  NftActionBuilder,
  TokenActionBuilder,
  type HiveEngineContractAction,
} from "../engine/index";
import { HiveSdkError } from "../types/index";
import type { KeychainClient } from "./KeychainClient";
import type { KeychainResult } from "./types";
import type {
  NftBurnInput,
  NftMintInput,
  NftMintMultipleInput,
  NftTransferInput,
} from "../issuer/nft/types";
import type { TokenActionInput, TokenBurnActionInput } from "../engine/TokenActionBuilder";

/** Every Keychain issuer operation is signed by this browser account. */
export interface KeychainIssuerOptions {
  /** Hive account that signs in Keychain. No aliases, no configuration. */
  username: string;
  /** Overrides the sidechain custom_json id (defaults to ssc-mainnet-hive). */
  id?: string;
  /** Display message shown inside the Keychain popup. */
  message?: string;
}

function assertUsername(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HiveSdkError(
      "VALIDATION_ERROR",
      `"username" must be the Hive account signing in Keychain`,
    );
  }
}

/**
 * NFT burn input for Keychain. `id` here is the NFT instance id, so the
 * custom_json id override is not part of this shape.
 */
export type KeychainNftBurnInput = Omit<NftBurnInput, "from">;

/** Strips the backend-only alias/mode fields from an issuer input shape. */
type EngineInput<T> = Omit<T, "from" | "mode" | "id">;

/**
 * Direct Hive Engine broadcasting through Hive Keychain.
 *
 * Completely independent of the configuration, alias, environment and signer
 * systems: the browser account signs itself and no private key ever exists in
 * SDK memory. It reuses the same pure engine action builders as the backend
 * flow, so both paths emit byte-identical contract payloads.
 */
export class KeychainEngineIssuer {
  protected readonly client: KeychainClient;

  constructor(client: KeychainClient) {
    this.client = client;
  }

  /** Broadcast an already-built Hive Engine contract action. */
  async broadcast(
    action: HiveEngineContractAction,
    options: KeychainIssuerOptions,
  ): Promise<KeychainResult> {
    assertUsername(options?.username);
    return this.client.customJsonRaw({
      username: options.username,
      id: options.id ?? HIVE_ENGINE_CUSTOM_JSON_ID,
      json: JSON.stringify(action),
      authority: HIVE_ENGINE_AUTHORITY,
      message:
        options.message ?? `${action.contractName}: ${action.contractAction}`,
    });
  }
}

/** `hive.keychain.issuer.token` — Hive Engine `tokens` contract via Keychain. */
export class KeychainTokenIssuer extends KeychainEngineIssuer {
  /** Pure builder, reusable for previews and dry runs. */
  public readonly actions = new TokenActionBuilder();

  buildMint(input: TokenActionInput): HiveEngineContractAction {
    return this.actions.buildIssue(input);
  }

  buildTransfer(input: TokenActionInput): HiveEngineContractAction {
    return this.actions.buildTransfer(input);
  }

  buildBurn(input: TokenBurnActionInput): HiveEngineContractAction {
    return this.actions.buildBurn(input);
  }

  async mint(
    input: TokenActionInput & KeychainIssuerOptions,
  ): Promise<KeychainResult> {
    return this.broadcast(this.buildMint(input), input);
  }

  async transfer(
    input: TokenActionInput & KeychainIssuerOptions,
  ): Promise<KeychainResult> {
    return this.broadcast(this.buildTransfer(input), input);
  }

  async burn(
    input: TokenBurnActionInput & KeychainIssuerOptions,
  ): Promise<KeychainResult> {
    const { username, ...rest } = input;
    return this.broadcast(this.buildBurn(rest), {
      username,
      ...(input.message ? { message: input.message } : {}),
    });
  }
}

/** `hive.keychain.issuer.nft` — Hive Engine `nft` contract via Keychain. */
export class KeychainNftIssuer extends KeychainEngineIssuer {
  public readonly actions = new NftActionBuilder();

  buildMint<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    input: EngineInput<NftMintInput<TProperties>>,
  ): HiveEngineContractAction {
    return this.actions.buildIssue<TProperties>(input);
  }

  buildMintMultiple<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    input: EngineInput<NftMintMultipleInput<TProperties>>,
  ): HiveEngineContractAction {
    return this.actions.buildIssueMultiple<TProperties>(input);
  }

  buildTransfer(input: EngineInput<NftTransferInput>): HiveEngineContractAction {
    return this.actions.buildTransfer(input);
  }

  /** Burn — transfer to `"null"` unless `account` is supplied. */
  buildBurn(input: KeychainNftBurnInput): HiveEngineContractAction {
    return this.actions.buildBurn(input);
  }

  async mint<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    input: EngineInput<NftMintInput<TProperties>> & KeychainIssuerOptions,
  ): Promise<KeychainResult> {
    return this.broadcast(this.buildMint<TProperties>(input), input);
  }

  async mintMultiple<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    input: EngineInput<NftMintMultipleInput<TProperties>> & KeychainIssuerOptions,
  ): Promise<KeychainResult> {
    return this.broadcast(this.buildMintMultiple<TProperties>(input), input);
  }

  async transfer(
    input: EngineInput<NftTransferInput> & KeychainIssuerOptions,
  ): Promise<KeychainResult> {
    return this.broadcast(this.buildTransfer(input), input);
  }

  async burn(
    input: KeychainNftBurnInput & Omit<KeychainIssuerOptions, "id">,
  ): Promise<KeychainResult> {
    const { username, ...rest } = input;
    return this.broadcast(this.buildBurn(rest), {
      username,
      ...(input.message ? { message: input.message } : {}),
    });
  }
}

/** Grouped Keychain issuers: `hive.keychain.issuer.token` / `.nft`. */
export class KeychainIssuer {
  public readonly token: KeychainTokenIssuer;
  public readonly nft: KeychainNftIssuer;

  constructor(client: KeychainClient) {
    this.token = new KeychainTokenIssuer(client);
    this.nft = new KeychainNftIssuer(client);
  }
}
