import { TOKEN_ACTIONS, TOKEN_CONTRACT } from "./constants";
import { DEFAULT_BURN_ACCOUNT, resolveBurnAccount } from "./burn";
import { assertAccountName, assertTokenQuantity, assertTokenSymbol } from "../utils/validation";
import type { HiveEngineContractAction } from "./types";

export interface TokenActionInput {
  symbol: string;
  account: string;
  quantity: string;
  memo?: string;
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
