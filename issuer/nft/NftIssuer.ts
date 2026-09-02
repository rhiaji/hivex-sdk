import { HIVE_ENGINE_CUSTOM_JSON_ID, type HiveEngineContractAction } from "../../engine/index";
import { isAccountReference, type AccountReference } from "../../configs/AccountReference";
import { HiveSdkError } from "../../types/index";
import { IssuerDispatcher } from "../IssuerDispatcher";
import type { IssuerOperationPreview } from "../types";
import { NftAccountResolutionError, NftIssuanceError, NftBurnError, NftTransferError, NftValidationError } from "./errors";
import { NftTransactionBuilder, countNftInstances } from "./NftTransactionBuilder";
import type {
  NftBurnInput,
  NftMintInput,
  NftMintMultipleInput,
  NftTransactionResult,
  NftTransferInput,
} from "./types";

/**
 * Public backend NFT API.
 *
 * Responsibilities: validation, account alias resolution, payload generation
 * (delegated to NftTransactionBuilder), signing + broadcasting and result
 * normalization. It never stores private keys and never performs raw RPC POSTs
 * — that belongs to hive.signer and hive.rpc. Browser flows use the separate
 * `hive.keychain.issuer.nft` API.
 */
export class NftIssuer extends IssuerDispatcher {
  /** Reusable Hive Engine NFT action builder (also usable by Keychain flows). */
  public readonly actions = new NftTransactionBuilder();

  /** Offline preview of an issue operation. No keys, no network. */
  buildMint<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    input: NftMintInput<TProperties>,
  ): IssuerOperationPreview {
    return this.previewNftAction({
      from: input.from,
      account: input.account,
      action: this.actions.buildIssue<TProperties>(input),
      ...(input.id ? { id: input.id } : {}),
    });
  }

  /** Offline preview of an issueMultiple operation. No keys, no network. */
  buildMintMultiple<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    input: NftMintMultipleInput<TProperties>,
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

  async mint<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    input: NftMintInput<TProperties>,
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

  async mintMultiple<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    input: NftMintMultipleInput<TProperties>,
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

  /** Single execution flow shared by mint, mintMultiple and transfer. */
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
