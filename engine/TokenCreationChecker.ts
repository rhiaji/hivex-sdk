import { EngineRpcClient } from "../payments/engine/EngineRpcClient";
import { HiveSdkError } from "../types/index";
import { assertAccountName, isPlainObject } from "../utils/validation";
import { assertCreatableTokenSymbol } from "./TokenActionBuilder";
import { BEE_SYMBOL, DEFAULT_TOKEN_CREATION_FEE, TOKEN_CONTRACT } from "./constants";

/** Minimal shape of a Hive Engine `tokens.tokens` row. */
export interface EngineTokenRow {
  symbol?: string;
  name?: string;
  issuer?: string;
  precision?: number;
  maxSupply?: string;
  supply?: string;
  metadata?: unknown;
  [key: string]: unknown;
}

/** Result of the two preflight checks run before `tokens.create`. */
export interface TokenCreationCheck {
  symbol: string;
  account: string;
  /** BEE required by the sidechain to create a token. */
  fee: string;
  /** The account's liquid BEE balance. */
  balance: string;
  hasEnoughBee: boolean;
  symbolExists: boolean;
  /** The already-existing token row, when the symbol is taken. */
  existingToken: EngineTokenRow | null;
  /** True only when the account can afford the fee and the symbol is free. */
  ok: boolean;
  /** Human-readable reasons why creation would fail. */
  issues: string[];
}

export interface TokenCreationCheckInput {
  /** Account that will pay the creation fee and own the token. */
  account: string;
  symbol: string;
}

/** Decimal-string comparison. Never parses blockchain amounts as floats. */
export function compareDecimalStrings(left: string, right: string): number {
  const split = (value: string): [string, string] => {
    const [whole = "0", fraction = ""] = value.trim().split(".");
    return [whole.replace(/^0+(?=\d)/, ""), fraction];
  };
  const [leftWhole, leftFraction] = split(left);
  const [rightWhole, rightFraction] = split(right);

  if (leftWhole.length !== rightWhole.length) {
    return leftWhole.length > rightWhole.length ? 1 : -1;
  }
  if (leftWhole !== rightWhole) return leftWhole > rightWhole ? 1 : -1;

  const length = Math.max(leftFraction.length, rightFraction.length);
  const a = leftFraction.padEnd(length, "0");
  const b = rightFraction.padEnd(length, "0");
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

/**
 * Read-only Hive Engine preflight for token creation.
 *
 * Creating a token costs BEE and every symbol is unique on the sidechain, so
 * both facts are verified against the contracts endpoint before anything is
 * signed. No keys, no broadcasting — this layer only reads.
 */
export class TokenCreationChecker {
  private readonly rpc: EngineRpcClient;

  constructor(rpc: EngineRpcClient = new EngineRpcClient({})) {
    this.rpc = rpc;
  }

  /** Liquid BEE balance of an account, as a decimal string ("0" when none). */
  async getBeeBalance(account: string): Promise<string> {
    assertAccountName(account);
    const row = await this.rpc.findOne<Record<string, unknown>>({
      contract: TOKEN_CONTRACT,
      table: "balances",
      query: { account, symbol: BEE_SYMBOL },
    });
    const balance = isPlainObject(row) ? row["balance"] : undefined;
    return typeof balance === "string" ? balance : "0";
  }

  /** The sidechain's current token creation fee in BEE. */
  async getCreationFee(): Promise<string> {
    const row = await this.rpc.findOne<Record<string, unknown>>({
      contract: TOKEN_CONTRACT,
      table: "params",
      query: {},
    });
    const fee = isPlainObject(row) ? row["tokenCreationFee"] : undefined;
    if (typeof fee === "string" && fee.trim() !== "") return fee;
    if (typeof fee === "number" && Number.isFinite(fee)) return String(fee);
    return DEFAULT_TOKEN_CREATION_FEE;
  }

  /** The existing token row for a symbol, or null when the symbol is free. */
  async findToken(symbol: string): Promise<EngineTokenRow | null> {
    assertCreatableTokenSymbol(symbol);
    const row = await this.rpc.findOne<EngineTokenRow>({
      contract: TOKEN_CONTRACT,
      table: "tokens",
      query: { symbol },
    });
    return isPlainObject(row) ? (row as EngineTokenRow) : null;
  }

  /** Runs both checks and reports the outcome without throwing. */
  async check(input: TokenCreationCheckInput): Promise<TokenCreationCheck> {
    assertAccountName(input?.account);
    assertCreatableTokenSymbol(input?.symbol);

    const [fee, balance, existingToken] = await Promise.all([
      this.getCreationFee(),
      this.getBeeBalance(input.account),
      this.findToken(input.symbol),
    ]);

    const hasEnoughBee = compareDecimalStrings(balance, fee) >= 0;
    const symbolExists = existingToken !== null;
    const issues: string[] = [];
    if (!hasEnoughBee) {
      issues.push(
        `"${input.account}" has ${balance} ${BEE_SYMBOL} but token creation costs ${fee} ${BEE_SYMBOL}`,
      );
    }
    if (symbolExists) {
      issues.push(`Token "${input.symbol}" already exists on Hive Engine`);
    }

    return {
      symbol: input.symbol,
      account: input.account,
      fee,
      balance,
      hasEnoughBee,
      symbolExists,
      existingToken,
      ok: hasEnoughBee && !symbolExists,
      issues,
    };
  }

  /**
   * Same as `check()` but throws the matching SDK error, so a create call never
   * reaches Keychain or a signing key when it is guaranteed to fail.
   */
  async assertCanCreate(input: TokenCreationCheckInput): Promise<TokenCreationCheck> {
    const result = await this.check(input);
    if (!result.hasEnoughBee) {
      throw new HiveSdkError("INSUFFICIENT_BEE", result.issues[0] ?? "Not enough BEE", result);
    }
    if (result.symbolExists) {
      throw new HiveSdkError(
        "TOKEN_ALREADY_EXISTS",
        `Token "${result.symbol}" already exists on Hive Engine`,
        result,
      );
    }
    return result;
  }
}
