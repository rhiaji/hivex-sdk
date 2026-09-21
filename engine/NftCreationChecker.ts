import { EngineRpcClient } from "../payments/engine/EngineRpcClient";
import { HiveSdkError } from "../types/index";
import { assertAccountName, isPlainObject } from "../utils/validation";
import { assertCreatableNftSymbol } from "./NftActionBuilder";
import { compareDecimalStrings } from "./TokenCreationChecker";
import {
  BEE_SYMBOL,
  DEFAULT_NFT_CREATION_FEE,
  NFT_CONTRACT,
  TOKEN_CONTRACT,
} from "./constants";

/** Minimal shape of a Hive Engine `nft.nfts` row. */
export interface EngineNftRow {
  symbol?: string;
  name?: string;
  issuer?: string;
  maxSupply?: string;
  supply?: string;
  metadata?: unknown;
  [key: string]: unknown;
}

/** Result of the two preflight checks run before `nft.create`. */
export interface NftCreationCheck {
  symbol: string;
  account: string;
  /** BEE required by the sidechain to create an NFT. */
  fee: string;
  /** The account's liquid BEE balance. */
  balance: string;
  hasEnoughBee: boolean;
  symbolExists: boolean;
  /** The already-existing NFT row, when the symbol is taken. */
  existingNft: EngineNftRow | null;
  /** True only when the account can afford the fee and the symbol is free. */
  ok: boolean;
  /** Human-readable reasons why creation would fail. */
  issues: string[];
}

export interface NftCreationCheckInput {
  /** Account that will pay the creation fee and own the NFT. */
  account: string;
  symbol: string;
}

/**
 * Read-only Hive Engine preflight for NFT creation.
 *
 * Same flow as token creation: creating an NFT costs BEE and every NFT symbol
 * is unique on the sidechain, so both facts are verified against the contracts
 * endpoint before anything is signed. No keys, no broadcasting.
 */
export class NftCreationChecker {
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

  /** The sidechain's current NFT creation fee in BEE. */
  async getCreationFee(): Promise<string> {
    const row = await this.rpc.findOne<Record<string, unknown>>({
      contract: NFT_CONTRACT,
      table: "params",
      query: {},
    });
    const fee = isPlainObject(row) ? row["nftCreationFee"] : undefined;
    if (typeof fee === "string" && fee.trim() !== "") return fee;
    if (typeof fee === "number" && Number.isFinite(fee)) return String(fee);
    return DEFAULT_NFT_CREATION_FEE;
  }

  /** The existing NFT row for a symbol, or null when the symbol is free. */
  async findNft(symbol: string): Promise<EngineNftRow | null> {
    assertCreatableNftSymbol(symbol);
    const row = await this.rpc.findOne<EngineNftRow>({
      contract: NFT_CONTRACT,
      table: "nfts",
      query: { symbol },
    });
    return isPlainObject(row) ? (row as EngineNftRow) : null;
  }

  /** Runs both checks and reports the outcome without throwing. */
  async check(input: NftCreationCheckInput): Promise<NftCreationCheck> {
    assertAccountName(input?.account);
    assertCreatableNftSymbol(input?.symbol);

    const [fee, balance, existingNft] = await Promise.all([
      this.getCreationFee(),
      this.getBeeBalance(input.account),
      this.findNft(input.symbol),
    ]);

    const hasEnoughBee = compareDecimalStrings(balance, fee) >= 0;
    const symbolExists = existingNft !== null;
    const issues: string[] = [];
    if (!hasEnoughBee) {
      issues.push(
        `"${input.account}" has ${balance} ${BEE_SYMBOL} but NFT creation costs ${fee} ${BEE_SYMBOL}`,
      );
    }
    if (symbolExists) {
      issues.push(`NFT "${input.symbol}" already exists on Hive Engine`);
    }

    return {
      symbol: input.symbol,
      account: input.account,
      fee,
      balance,
      hasEnoughBee,
      symbolExists,
      existingNft,
      ok: hasEnoughBee && !symbolExists,
      issues,
    };
  }

  /**
   * Same as `check()` but throws the matching SDK error, so a create call never
   * reaches Keychain or a signing key when it is guaranteed to fail.
   */
  async assertCanCreate(input: NftCreationCheckInput): Promise<NftCreationCheck> {
    const result = await this.check(input);
    if (!result.hasEnoughBee) {
      throw new HiveSdkError("INSUFFICIENT_BEE", result.issues[0] ?? "Not enough BEE", result);
    }
    if (result.symbolExists) {
      throw new HiveSdkError(
        "NFT_ALREADY_EXISTS",
        `NFT "${result.symbol}" already exists on Hive Engine`,
        result,
      );
    }
    return result;
  }
}
