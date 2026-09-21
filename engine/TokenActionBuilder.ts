import {
  TOKEN_ACTIONS,
  TOKEN_CONTRACT,
  TOKEN_MAX_SUPPLY_LIMIT,
  TOKEN_NAME_MAX_LENGTH,
  TOKEN_PRECISION_MAX,
  TOKEN_SYMBOL_MAX_LENGTH,
  TOKEN_URL_MAX_LENGTH,
} from "./constants";
import { DEFAULT_BURN_ACCOUNT, resolveBurnAccount } from "./burn";
import { HiveSdkError } from "../types/index";
import { assertAccountName, assertTokenQuantity, assertTokenSymbol } from "../utils/validation";
import type { HiveEngineContractAction } from "./types";

export interface TokenActionInput {
  symbol: string;
  account: string;
  quantity: string;
  memo?: string;
}

/** `tokens.create` input. Every amount stays a string. */
export interface TokenCreateActionInput {
  /** Uppercase letters only, up to 10 characters. */
  symbol: string;
  /** Display name, up to 50 letters, digits and spaces. */
  name: string;
  /** Decimal places, 0 to 8. */
  precision: number;
  /** Positive decimal string, up to 9007199254740991. */
  maxSupply: string;
  /** Optional project website. */
  url?: string;
}

/**
 * Symbols eligible for creation are stricter than symbols already on chain:
 * the sidechain only accepts uppercase letters, 1 to 10 characters.
 */
export function assertCreatableTokenSymbol(value: unknown, field = "symbol"): asserts value is string {
  if (
    typeof value !== "string" ||
    !new RegExp(`^[A-Z]{1,${TOKEN_SYMBOL_MAX_LENGTH}}$`).test(value.trim())
  ) {
    throw new HiveSdkError(
      "VALIDATION_ERROR",
      `"${field}" must be ${TOKEN_SYMBOL_MAX_LENGTH} uppercase letters or fewer`,
    );
  }
}

function assertTokenName(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > TOKEN_NAME_MAX_LENGTH ||
    !/^[a-zA-Z0-9 ]+$/.test(value)
  ) {
    throw new HiveSdkError(
      "VALIDATION_ERROR",
      `"name" must be 1 to ${TOKEN_NAME_MAX_LENGTH} letters, digits or spaces`,
    );
  }
}

function assertTokenPrecision(value: unknown): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > TOKEN_PRECISION_MAX
  ) {
    throw new HiveSdkError(
      "VALIDATION_ERROR",
      `"precision" must be an integer between 0 and ${TOKEN_PRECISION_MAX}`,
    );
  }
}

function assertTokenMaxSupply(value: unknown): asserts value is string {
  assertTokenQuantity(value, "maxSupply");
  if (Number(value) > Number(TOKEN_MAX_SUPPLY_LIMIT)) {
    throw new HiveSdkError(
      "VALIDATION_ERROR",
      `"maxSupply" must not exceed ${TOKEN_MAX_SUPPLY_LIMIT}`,
    );
  }
}

function assertTokenUrl(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length > TOKEN_URL_MAX_LENGTH) {
    throw new HiveSdkError(
      "VALIDATION_ERROR",
      `"url" must be a string of at most ${TOKEN_URL_MAX_LENGTH} characters`,
    );
  }
}

export interface TokenBurnActionInput {
  symbol: string;
  quantity: string;
  /** Optional burn destination. Defaults to the Hive account `"null"`. */
  account?: string;
  memo?: string;
}

/**
 * Pure builder for Hive Engine `tokens` contract actions.
 * Environment independent: no signing, no network, no browser APIs, no configs.
 */
export { DEFAULT_BURN_ACCOUNT };

export class TokenActionBuilder {
  /**
   * `tokens.create` — the payload only. Affordability (BEE) and symbol
   * availability are runtime facts, checked by `TokenCreationChecker`.
   */
  buildCreate(input: TokenCreateActionInput): HiveEngineContractAction {
    assertCreatableTokenSymbol(input?.symbol);
    assertTokenName(input?.name);
    assertTokenPrecision(input?.precision);
    assertTokenMaxSupply(input?.maxSupply);
    if (input?.url !== undefined) assertTokenUrl(input.url);
    return {
      contractName: TOKEN_CONTRACT,
      contractAction: TOKEN_ACTIONS.create,
      contractPayload: {
        symbol: input.symbol,
        name: input.name,
        precision: input.precision,
        maxSupply: input.maxSupply,
        ...(input.url === undefined ? {} : { url: input.url }),
      },
    };
  }

  /** `tokens.issue` */
  buildIssue(input: TokenActionInput): HiveEngineContractAction {
    assertTokenSymbol(input?.symbol);
    assertAccountName(input?.account);
    assertTokenQuantity(input?.quantity);
    return {
      contractName: TOKEN_CONTRACT,
      contractAction: TOKEN_ACTIONS.issue,
      contractPayload: {
        symbol: input.symbol,
        to: input.account,
        quantity: input.quantity,
        ...(input.memo === undefined ? {} : { memo: input.memo }),
      },
    };
  }

  /** `tokens.transfer` */
  buildTransfer(input: TokenActionInput): HiveEngineContractAction {
    assertTokenSymbol(input?.symbol);
    assertAccountName(input?.account);
    assertTokenQuantity(input?.quantity);
    return {
      contractName: TOKEN_CONTRACT,
      contractAction: TOKEN_ACTIONS.transfer,
      contractPayload: {
        symbol: input.symbol,
        to: input.account,
        quantity: input.quantity,
        ...(input.memo === undefined ? {} : { memo: input.memo }),
      },
    };
  }

  /**
   * Burn — a `tokens.transfer` to the burn destination.
   * Defaults to the Hive account `"null"`; pass `account` to override it.
   */
  buildBurn(input: TokenBurnActionInput): HiveEngineContractAction {
    return this.buildTransfer({
      symbol: input?.symbol,
      account: resolveBurnAccount(input?.account),
      quantity: input?.quantity,
      ...(input?.memo === undefined ? {} : { memo: input.memo }),
    });
  }
}
