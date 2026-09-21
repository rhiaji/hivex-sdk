import { HIVE_ENGINE_CUSTOM_JSON_ID, type HiveEngineContractAction } from "../../engine/index";
import { isAccountReference, type AccountReference } from "../../configs/AccountReference";
import { HiveSdkError } from "../../types/index";
import { IssuerDispatcher } from "../IssuerDispatcher";
import type { IssuerOperationPreview } from "../types";
import { NftAccountResolutionError, NftIssuanceError, NftBurnError, NftTransferError, NftValidationError } from "./errors";
import { NftActionBuilder, countNftInstances } from "../../engine/NftActionBuilder";
import { NftCreationChecker, type NftCreationCheck } from "../../engine/NftCreationChecker";
import { requireAccountReference } from "../../configs/AccountReference";
import type {
  NftBurnInput,
  NftCreateInput,
  NftIssueInput,
  NftIssueMultipleInput,
  NftTransactionResult,
  NftTransferInput,
} from "./types";

/**
 * Public backend NFT API.
 *
 * Responsibilities: validation, account alias resolution, payload generation
 * (delegated to NftActionBuilder), signing + broadcasting and result
 * normalization. It never stores private keys and never performs raw RPC POSTs
 * — that belongs to the dispatcher and hive.rpc. Browser flows use the separate
 * `hive.keychainIssuer.nft` API.
 */
export class NftIssuer extends IssuerDispatcher {
  /** Reusable Hive Engine NFT action builder (also usable by Keychain flows). */
  public readonly actions = new NftActionBuilder();

  /** Read-only Hive Engine preflight used by `create()`. */
  public readonly creation = new NftCreationChecker();

  /** Offline preview of an NFT creation. No keys, no network. */
  buildCreate(input: NftCreateInput): IssuerOperationPreview {
    return this.previewNftAction({
      from: input.from,
      action: this.actions.buildCreate(input),
      ...(input.id ? { id: input.id } : {}),
    });
  }

  /** BEE balance and NFT symbol availability for the signing account. */
  async checkCreate(input: NftCreateInput): Promise<NftCreationCheck> {
    const reference = requireAccountReference(input.from);
    const resolved = this.context.resolveAccount(reference.alias);
    return this.creation.check({ account: resolved.account, symbol: input.symbol });
  }

  /**
   * Create a new Hive Engine NFT.
   *
   * Same flow as token creation: the signing account must hold the creation fee
   * in BEE and the symbol must not exist yet, then the action is signed and
   * broadcast.
   */
  async create(input: NftCreateInput): Promise<NftTransactionResult> {
    const action = this.actions.buildCreate(input);
    if (!input.skipChecks) {
      const reference = requireAccountReference(input.from);
      const resolved = this.context.resolveAccount(reference.alias);
      await this.creation.assertCanCreate({ account: resolved.account, symbol: input.symbol });
    }
    return this.executeNftTransaction({
      from: input.from,
      action,
      ...(input.id ? { id: input.id } : {}),
      errorFactory: (message, raw) => new NftIssuanceError(message, raw),
    });
  }

  /** Offline preview of an issue operation. No keys, no network. */
  buildIssue<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    input: NftIssueInput<TProperties>,
  ): IssuerOperationPreview {
    return this.previewNftAction({
      from: input.from,
      account: input.account,
      action: this.actions.buildIssue<TProperties>(input),
      ...(input.id ? { id: input.id } : {}),
    });
  }

  /** Offline preview of an issueMultiple operation. No keys, no network. */
  buildIssueMultiple<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    input: NftIssueMultipleInput<TProperties>,
  ): IssuerOperationPreview {
    return this.previewNftAction({
      from: input.from,
      action: this.actions.buildIssueMultiple<TProperties>(input),
      ...(input.id ? { id: input.id } : {}),
    });
  }

  /** Offline preview of a transfer operation. No keys, no network. */
  buildTransfer(input: NftTransferInput): IssuerOperationPreview {
    return this.previewNftAction({
      from: input.from,
      account: input.account,
      action: this.actions.buildTransfer(input),
      ...(input.id ? { id: input.id } : {}),
    });
  }

  /** Offline preview of a burn operation. No keys, no network. */
  buildBurn(input: NftBurnInput): IssuerOperationPreview {
    const action = this.actions.buildBurn(input);
    return this.previewNftAction({
      from: input.from,
      account: action.contractPayload["to"] as string,
      action,
    });
  }

  async issue<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    input: NftIssueInput<TProperties>,
  ): Promise<NftTransactionResult> {
    const action = this.actions.buildIssue<TProperties>(input);
    return this.executeNftTransaction({
      from: input.from,
      account: input.account,
      action,
      ...(input.id ? { id: input.id } : {}),
      errorFactory: (message, raw) => new NftIssuanceError(message, raw),
    });
  }

  async issueMultiple<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    input: NftIssueMultipleInput<TProperties>,
  ): Promise<NftTransactionResult> {
    const action = this.actions.buildIssueMultiple<TProperties>(input);
    return this.executeNftTransaction({
      from: input.from,
      action,
      ...(input.id ? { id: input.id } : {}),
      errorFactory: (message, raw) => new NftIssuanceError(message, raw),
    });
  }

  async transfer(input: NftTransferInput): Promise<NftTransactionResult> {
    const action = this.actions.buildTransfer(input);
    return this.executeNftTransaction({
      from: input.from,
      account: input.account,
      action,
      ...(input.id ? { id: input.id } : {}),
      errorFactory: (message, raw) => new NftTransferError(message, raw),
    });
  }

  /** Total NFT instances in a transfer input — exposed for callers batching explicitly. */
  countInstances(input: Pick<NftTransferInput, "nfts">): number {
    return countNftInstances(input.nfts);
  }

  /**
   * Burn — an NFT transfer to the burn destination.
   * Defaults to the Hive account `"null"`; pass `account` to override it.
   */
  async burn(input: NftBurnInput): Promise<NftTransactionResult> {
    const action = this.actions.buildBurn(input);
    return this.executeNftTransaction({
      from: input.from,
      account: action.contractPayload["to"] as string,
      action,
      errorFactory: (message, raw) => new NftBurnError(message, raw),
    });
  }

  /** Alias resolution + operation building shared by every preview. */
  private previewNftAction(params: {
    from: AccountReference;
    account?: string;
    action: HiveEngineContractAction;
    id?: string;
  }): IssuerOperationPreview {
    this.assertFrom(params.from);
    try {
      return this.previewEngineAction({
        from: params.from,
        engineAction: params.action,
        ...(params.account ? { account: params.account } : {}),
        id: params.id ?? HIVE_ENGINE_CUSTOM_JSON_ID,
      });
    } catch (error) {
      throw this.mapNftError(error, (message, raw) => new NftIssuanceError(message, raw));
    }
  }

  private assertFrom(from: AccountReference): void {
    if (!isAccountReference(from)) {
      throw new NftValidationError(
        `"from" must be an SDK account reference such as game.accounts.minter`,
      );
    }
  }

  private mapNftError(
    error: unknown,
    errorFactory: (message: string, raw?: unknown) => HiveSdkError,
  ): unknown {
    if (error instanceof HiveSdkError) {
      if (error.code === "ACCOUNT_ALIAS_NOT_FOUND" || error.code === "ACCOUNT_CONFIG_INVALID") {
        return new NftAccountResolutionError(error.message, error.raw);
      }
      if (error.code === "BROADCAST_ERROR") {
        return errorFactory(error.message, error.raw);
      }
      return error;
    }
    return errorFactory((error as Error)?.message ?? "NFT transaction failed");
  }

  /** Single execution flow shared by issue, issueMultiple and transfer. */
  private async executeNftTransaction(params: {
    from: AccountReference;
    account?: string;
    action: HiveEngineContractAction;
    id?: string;
    errorFactory: (message: string, raw?: unknown) => HiveSdkError;
  }): Promise<NftTransactionResult> {
    this.assertFrom(params.from);

    try {
      const result = await this.dispatchEngineAction({
        from: params.from,
        engineAction: params.action,
        ...(params.account ? { account: params.account } : {}),
        id: params.id ?? HIVE_ENGINE_CUSTOM_JSON_ID,
      });

      return {
        success: result.success,
        action: params.action.contractAction,
        ...(result.transactionId ? { transactionId: result.transactionId } : {}),
        ...(params.account ? { account: params.account } : {}),
        raw: result.raw,
      };
    } catch (error) {
      throw this.mapNftError(error, params.errorFactory);
    }
  }
}
