import {
  NFT_ACTIONS,
  NFT_CONTRACT,
  NFT_MAX_ISSUE_MULTIPLE_INSTANCES,
  NFT_MAX_TRANSFER_INSTANCES,
  NFT_MAX_SUPPLY_LIMIT,
  NFT_NAME_MAX_LENGTH,
  NFT_ORG_NAME_MAX_LENGTH,
  NFT_PRODUCT_NAME_MAX_LENGTH,
  NFT_SYMBOL_MAX_LENGTH,
  NFT_URL_MAX_LENGTH,
} from "./constants";
import type { HiveEngineContractAction } from "./types";
import { DEFAULT_BURN_ACCOUNT, resolveBurnAccount } from "./burn";
import { isPlainObject } from "../utils/validation";
import {
  NftSymbolError,
  NftTransferLimitError,
  NftValidationError,
} from "../issuer/nft/errors";
import type {
  NftBurnInput,
  NftIssueInput,
  NftIssueInstance,
  NftIssueMultipleInput,
  NftTransferInput,
  NftTransferItem,
} from "../issuer/nft/types";

/**
 * `nft.create` input. Only `name` and `symbol` are required by the sidechain;
 * everything else is optional and can be updated later in TribalDex.
 */
export interface NftCreateActionInput {
  /** Display name, up to 50 letters, digits and spaces. */
  name: string;
  /** Uppercase letters only, up to 10 characters. */
  symbol: string;
  /** Company / organization, optional. */
  orgName?: string;
  /** Product name, optional. */
  productName?: string;
  /** Positive decimal string. Unlimited when omitted. */
  maxSupply?: string;
  /** Project website, optional. */
  website?: string;
  /** Hive accounts allowed to issue on behalf of the owner. */
  authorizedIssuingAccounts?: string[];
  /** Smart contracts allowed to issue on behalf of the owner. */
  authorizedIssuingContracts?: string[];
}


/** Total number of NFT instances across every transfer item. */
export function countNftInstances(nfts: NftTransferItem[]): number {
  if (!Array.isArray(nfts)) return 0;
  return nfts.reduce((total, item) => total + (Array.isArray(item?.ids) ? item.ids.length : 0), 0);
}

export function assertNftSymbol(value: unknown, field = "symbol"): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new NftSymbolError(`"${field}" must be a non-empty string`);
  }
}

function assertAccount(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new NftValidationError(`"${field}" must be a non-empty string`);
  }
}

function assertProperties(value: unknown): void {
  if (value !== undefined && !isPlainObject(value)) {
    throw new NftValidationError(`"properties" must be an object`);
  }
}

function assertLockTokens(value: unknown): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    throw new NftValidationError(`"lockTokens" must be an object of symbol -> string quantity`);
  }
  for (const [symbol, quantity] of Object.entries(value)) {
    assertNftSymbol(symbol, "lockTokens symbol");
    if (typeof quantity !== "string" || quantity.trim() === "") {
      throw new NftValidationError(`"lockTokens.${symbol}" must be a string quantity`);
    }
  }
}

function assertNftItems(value: unknown, field: string): asserts value is NftTransferItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new NftValidationError(`"${field}" must be a non-empty array`);
  }
  for (const item of value) {
    if (!isPlainObject(item)) {
      throw new NftValidationError(`"${field}" entries must be objects`);
    }
    assertNftSymbol(item["symbol"]);
    const ids = item["ids"];
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new NftValidationError(`"${field}" entries require a non-empty "ids" array`);
    }
    for (const id of ids) {
      if (typeof id !== "string" || id.trim() === "") {
        throw new NftValidationError(`NFT ids must be non-empty strings (received ${typeof id})`);
      }
    }
  }
}

function buildInstancePayload(
  instance: NftIssueInstance<Record<string, unknown>>,
  fromType?: NftIssueInstance["fromType"],
): Record<string, unknown> {
  assertNftSymbol(instance?.symbol);
  assertAccount(instance?.account, "account");
  assertNftSymbol(instance?.feeSymbol, "feeSymbol");
  assertProperties(instance.properties);
  assertLockTokens(instance.lockTokens);
  if (instance.lockNfts !== undefined) assertNftItems(instance.lockNfts, "lockNfts");

  return {
    symbol: instance.symbol,
    to: instance.account,
    feeSymbol: instance.feeSymbol,
    ...(instance.accountType ? { toType: instance.accountType } : {}),
    ...(fromType ?? instance.fromType ? { fromType: fromType ?? instance.fromType } : {}),
    ...(instance.properties ? { properties: instance.properties } : {}),
    ...(instance.lockTokens ? { lockTokens: instance.lockTokens } : {}),
    ...(instance.lockNfts ? { lockNfts: instance.lockNfts } : {}),
  };
}

/**
 * Pure builder for Hive Engine NFT contract actions.
 * Shared by the backend signing flow and the Hive Keychain flow — it performs
 * no signing, no network access and holds no state.
 */
export { DEFAULT_BURN_ACCOUNT };

/**
 * Symbols eligible for creation are stricter than symbols already on chain:
 * the sidechain only accepts uppercase letters, 1 to 10 characters.
 */
export function assertCreatableNftSymbol(value: unknown, field = "symbol"): asserts value is string {
  if (
    typeof value !== "string" ||
    !new RegExp(`^[A-Z]{1,${NFT_SYMBOL_MAX_LENGTH}}$`).test(value.trim())
  ) {
    throw new NftSymbolError(
      `"${field}" must be ${NFT_SYMBOL_MAX_LENGTH} uppercase letters or fewer`,
    );
  }
}

function assertNftText(value: unknown, field: string, maxLength: number): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > maxLength ||
    !/^[a-zA-Z0-9 ]+$/.test(value)
  ) {
    throw new NftValidationError(
      `"${field}" must be 1 to ${maxLength} letters, digits or spaces`,
    );
  }
}

function assertNftMaxSupply(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    throw new NftValidationError(`"maxSupply" must be a positive integer string`);
  }
  const supply = value.trim();
  if (Number(supply) < 1 || Number(supply) > Number(NFT_MAX_SUPPLY_LIMIT)) {
    throw new NftValidationError(`"maxSupply" must be between 1 and ${NFT_MAX_SUPPLY_LIMIT}`);
  }
}

function assertNftWebsite(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length > NFT_URL_MAX_LENGTH) {
    throw new NftValidationError(
      `"website" must be a string of at most ${NFT_URL_MAX_LENGTH} characters`,
    );
  }
}

function assertAuthorizedList(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new NftValidationError(`"${field}" must be a non-empty array of names`);
  }
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw new NftValidationError(`"${field}" entries must be non-empty strings`);
    }
  }
}

export class NftActionBuilder {
  /**
   * `nft.create` — the payload only. Affordability (BEE) and symbol
   * availability are runtime facts, checked by `NftCreationChecker`.
   */
  buildCreate(input: NftCreateActionInput): HiveEngineContractAction {
    assertNftText(input?.name, "name", NFT_NAME_MAX_LENGTH);
    assertCreatableNftSymbol(input?.symbol);
    if (input?.orgName !== undefined) {
      assertNftText(input.orgName, "orgName", NFT_ORG_NAME_MAX_LENGTH);
    }
    if (input?.productName !== undefined) {
      assertNftText(input.productName, "productName", NFT_PRODUCT_NAME_MAX_LENGTH);
    }
    if (input?.maxSupply !== undefined) assertNftMaxSupply(input.maxSupply);
    if (input?.website !== undefined) assertNftWebsite(input.website);
    if (input?.authorizedIssuingAccounts !== undefined) {
      assertAuthorizedList(input.authorizedIssuingAccounts, "authorizedIssuingAccounts");
    }
    if (input?.authorizedIssuingContracts !== undefined) {
      assertAuthorizedList(input.authorizedIssuingContracts, "authorizedIssuingContracts");
    }

    return {
      contractName: NFT_CONTRACT,
      contractAction: NFT_ACTIONS.create,
      contractPayload: {
        name: input.name,
        symbol: input.symbol,
        ...(input.orgName === undefined ? {} : { orgName: input.orgName }),
        ...(input.productName === undefined ? {} : { productName: input.productName }),
        ...(input.maxSupply === undefined ? {} : { maxSupply: input.maxSupply }),
        ...(input.website === undefined ? {} : { website: input.website }),
        ...(input.authorizedIssuingAccounts === undefined
          ? {}
          : { authorizedIssuingAccounts: [...input.authorizedIssuingAccounts] }),
        ...(input.authorizedIssuingContracts === undefined
          ? {}
          : { authorizedIssuingContracts: [...input.authorizedIssuingContracts] }),
      },
    };
  }

  /** `nft.issue` */
  buildIssue<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    input: Omit<NftIssueInput<TProperties>, "from" | "mode" | "id">,
  ): HiveEngineContractAction {
    const payload = buildInstancePayload(
      input as unknown as NftIssueInstance<Record<string, unknown>>,
      input.fromType,
    );
    return {
      contractName: NFT_CONTRACT,
      contractAction: NFT_ACTIONS.issue,
      contractPayload: payload,
    };
  }

  /** `nft.issueMultiple` */
  buildIssueMultiple<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    input: Omit<NftIssueMultipleInput<TProperties>, "from" | "mode" | "id">,
  ): HiveEngineContractAction {
    if (!Array.isArray(input?.instances) || input.instances.length === 0) {
      throw new NftValidationError(`"instances" must be a non-empty array`);
    }
    if (input.instances.length > NFT_MAX_ISSUE_MULTIPLE_INSTANCES) {
      throw new NftTransferLimitError(
        `issueMultiple accepts at most ${NFT_MAX_ISSUE_MULTIPLE_INSTANCES} instances (received ${input.instances.length})`,
      );
    }
    const instances = input.instances.map((instance) =>
      buildInstancePayload(instance as unknown as NftIssueInstance<Record<string, unknown>>),
    );
    return {
      contractName: NFT_CONTRACT,
      contractAction: NFT_ACTIONS.issueMultiple,
      contractPayload: { instances },
    };
  }

  /** `nft.transfer` */
  buildTransfer(input: Omit<NftTransferInput, "from" | "mode" | "id">): HiveEngineContractAction {
    assertAccount(input?.account, "account");
    assertNftItems(input?.nfts, "nfts");

    const total = countNftInstances(input.nfts);
    if (total > NFT_MAX_TRANSFER_INSTANCES) {
      throw new NftTransferLimitError(
        `A single NFT transfer supports at most ${NFT_MAX_TRANSFER_INSTANCES} instances (received ${total}). Split the transfer explicitly.`,
      );
    }

    return {
      contractName: NFT_CONTRACT,
      contractAction: NFT_ACTIONS.transfer,
      contractPayload: {
        to: input.account,
        ...(input.accountType ? { toType: input.accountType } : {}),
        ...(input.fromType ? { fromType: input.fromType } : {}),
        nfts: input.nfts.map((item) => ({ symbol: item.symbol, ids: [...item.ids] })),
      },
    };
  }

  /**
   * Burn — an `nft.transfer` to the burn destination.
   * Defaults to the Hive account `"null"`; pass `account` to override it.
   */
  buildBurn(input: Omit<NftBurnInput, "from" | "id"> & { id?: string | string[] }): HiveEngineContractAction {
    assertNftSymbol(input?.symbol);
    const ids = Array.isArray(input?.id) ? input.id : input?.id === undefined ? [] : [input.id];
    if (ids.length === 0) {
      throw new NftValidationError(`"id" must be an NFT id or a non-empty array of ids`);
    }
    return this.buildTransfer({
      account: resolveBurnAccount(input?.account),
      ...(input?.accountType ? { accountType: input.accountType } : {}),
      ...(input?.fromType ? { fromType: input.fromType } : {}),
      nfts: [{ symbol: input.symbol, ids }],
    });
  }
}
