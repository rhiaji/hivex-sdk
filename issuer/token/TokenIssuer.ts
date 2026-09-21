import { IssuerDispatcher } from "../IssuerDispatcher";
import {
  HIVE_ENGINE_CUSTOM_JSON_ID,
  TokenActionBuilder,
  TokenCreationChecker,
  type TokenCreationCheck,
} from "../../engine/index";
import { requireAccountReference } from "../../configs/AccountReference";
import type { IssuerOperationPreview, IssuerTransactionResult } from "../types";
import type {
  TokenBurnInput,
  TokenCreateInput,
  TokenIssueInput,
  TokenTransferInput,
} from "./types";

/**
 * Backend token operations on the Hive Engine `tokens` contract.
 *
 * `from` is a configuration account reference (the signing account resolved
 * from configuration + environment); `account` is always the destination
 * blockchain account. Payload construction and validation are delegated to the
 * shared `TokenActionBuilder`, so this path and the Keychain path emit
 * byte-identical contract actions. Only signing and broadcasting differ.
 */
export class TokenIssuer extends IssuerDispatcher {
  /** Pure, environment-independent protocol builder shared with Keychain. */
  public readonly actions = new TokenActionBuilder();

  /** Read-only Hive Engine preflight used by `create()`. */
  public readonly creation = new TokenCreationChecker();

  /** Offline preview of a token creation. No keys, no network. */
  buildCreate(input: TokenCreateInput): IssuerOperationPreview {
    return this.previewEngineAction({
      from: input.from,
      engineAction: this.actions.buildCreate(input),
      id: input.id ?? HIVE_ENGINE_CUSTOM_JSON_ID,
    });
  }

  /** BEE balance and symbol availability for the signing account. */
  async checkCreate(input: TokenCreateInput): Promise<TokenCreationCheck> {
    const reference = requireAccountReference(input.from);
    const resolved = this.context.resolveAccount(reference.alias);
    return this.creation.check({ account: resolved.account, symbol: input.symbol });
  }

  /**
   * Create a new Hive Engine token.
   *
   * Runs the preflight first — the signing account must hold the creation fee
   * in BEE and the symbol must not exist yet — then signs and broadcasts.
   */
  async create(input: TokenCreateInput): Promise<IssuerTransactionResult> {
    const action = this.actions.buildCreate(input);
    if (!input.skipChecks) {
      const reference = requireAccountReference(input.from);
      const resolved = this.context.resolveAccount(reference.alias);
      await this.creation.assertCanCreate({ account: resolved.account, symbol: input.symbol });
    }
    return this.dispatchEngineAction({
      from: input.from,
      engineAction: action,
      id: input.id ?? HIVE_ENGINE_CUSTOM_JSON_ID,
    });
  }

  /** Offline preview of an issue operation. No keys, no network. */
  buildIssue(input: TokenIssueInput): IssuerOperationPreview {
    return this.previewEngineAction({
      from: input.from,
      engineAction: this.actions.buildIssue(input),
      account: input.account,
      id: input.id ?? HIVE_ENGINE_CUSTOM_JSON_ID,
    });
  }

  /** Offline preview of a transfer operation. No keys, no network. */
  buildTransfer(input: TokenTransferInput): IssuerOperationPreview {
    return this.previewEngineAction({
      from: input.from,
      engineAction: this.actions.buildTransfer(input),
      account: input.account,
      id: input.id ?? HIVE_ENGINE_CUSTOM_JSON_ID,
    });
  }

  /** Offline preview of a burn operation. No keys, no network. */
  buildBurn(input: TokenBurnInput): IssuerOperationPreview {
    const action = this.actions.buildBurn(input);
    return this.previewEngineAction({
      from: input.from,
      engineAction: action,
      account: action.contractPayload["to"] as string,
      id: input.id ?? HIVE_ENGINE_CUSTOM_JSON_ID,
    });
  }

  async issue(input: TokenIssueInput): Promise<IssuerTransactionResult> {
    return this.dispatchEngineAction({
      from: input.from,
      engineAction: this.actions.buildIssue(input),
      account: input.account,
      id: input.id ?? HIVE_ENGINE_CUSTOM_JSON_ID,
    });
  }

  async transfer(input: TokenTransferInput): Promise<IssuerTransactionResult> {
    return this.dispatchEngineAction({
      from: input.from,
      engineAction: this.actions.buildTransfer(input),
      account: input.account,
      id: input.id ?? HIVE_ENGINE_CUSTOM_JSON_ID,
    });
  }

  /**
   * Burn — a token transfer to the burn destination.
   * Defaults to the Hive account `"null"`; pass `account` to override it.
   */
  async burn(input: TokenBurnInput): Promise<IssuerTransactionResult> {
    const action = this.actions.buildBurn(input);
    return this.dispatchEngineAction({
      from: input.from,
      engineAction: action,
      account: action.contractPayload["to"] as string,
      id: input.id ?? HIVE_ENGINE_CUSTOM_JSON_ID,
    });
  }
}
