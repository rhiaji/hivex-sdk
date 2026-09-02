import type { KeychainClient } from "../keychain/KeychainClient";
import type { RpcClient } from "../rpc/RpcClient";
import type { CustomJsonBuilder } from "../transaction/CustomJsonBuilder";
import { TransactionAssembler } from "../transaction/TransactionAssembler";
import { signTransaction } from "../transaction/signTransaction";
import { HiveSdkError } from "../types/index";
import { isPlainObject } from "../utils/validation";
import type { ResolvedAccount, ResolvedSigningAccount } from "../configs/types";
import { requireAccountReference, type AccountReference } from "../configs/AccountReference";
import type { IssuerOperationPreview, IssuerTransactionResult } from "./types";
import type { HiveEngineContractAction } from "../engine/index";

/** Everything an issuer needs from its configuration context. */
export interface IssuerContext {
  rpc: RpcClient;
  keychain: KeychainClient;
  builder: CustomJsonBuilder;
  /** Name of the configuration this issuer is bound to. */
  resolveAccount: (alias: string) => ResolvedAccount;
  /** Resolves account + private key lazily, only when a transaction is signed. */
  resolveSigningAccount: (alias: string) => ResolvedSigningAccount;
  /** Default custom_json application id from configuration options. */
  applicationId?: string;
}

export interface DispatchInput {
  /** Account reference of the signing/sending account. */
  from: AccountReference;
  action: string;
  metadata: Record<string, unknown> | null;
  /** Destination account echoed back in the result. */
  account?: string;
  id?: string;
}

/**
 * Shared machinery for every backend issuer operation:
 * alias -> account -> custom_json -> sign -> broadcast.
 *
 * This layer always signs with a resolved private key and broadcasts over RPC.
 * Browser flows live in a completely separate API (`hive.keychainIssuer`).
 */
export class IssuerDispatcher {
  protected readonly context: IssuerContext;

  constructor(context: IssuerContext) {
    this.context = context;
  }

  protected resolveApplicationId(id?: string): string {
    const applicationId = id ?? this.context.applicationId;
    if (typeof applicationId !== "string" || applicationId.trim() === "") {
      throw new HiveSdkError(
        "VALIDATION_ERROR",
        'A custom_json application id is required. Pass `id` or set options.applicationId on the configuration.',
      );
    }
    return applicationId;
  }

  private toOperation(params: {
    account: string;
    id: string;
    json: string;
  }): unknown[] {
    return [
      "custom_json",
      {
        required_auths: [params.account],
        required_posting_auths: [],
        id: params.id,
        json: params.json,
      },
    ];
  }

  /**
   * Offline preview of a raw Hive Engine contract action: resolves the alias
   * and returns the exact operation, without keys and without network access.
   */
  protected previewEngineAction(input: {
    from: AccountReference;
    engineAction: HiveEngineContractAction;
    account?: string;
    id: string;
  }): IssuerOperationPreview {
    const reference = requireAccountReference(input.from);
    const resolved = this.context.resolveAccount(reference.alias);
    const json = JSON.stringify(input.engineAction);

    return {
      alias: resolved.alias,
      account: resolved.account,
      ...(input.account ? { destination: input.account } : {}),
      id: input.id,
      json,
      operation: this.toOperation({ account: resolved.account, id: input.id, json }),
    };
  }

  /** Offline preview of a `{ action, metadata }` protocol operation. */
  protected previewProtocolAction(input: DispatchInput): IssuerOperationPreview {
    const reference = requireAccountReference(input.from);
    const resolved = this.context.resolveAccount(reference.alias);
    const applicationId = this.resolveApplicationId(input.id);

    const operation = this.context.builder.buildOperation({
      username: resolved.account,
      id: applicationId,
      action: input.action,
      metadata: input.metadata,
      authority: "active",
    });

    return {
      alias: resolved.alias,
      account: resolved.account,
      ...(input.account ? { destination: input.account } : {}),
      id: operation.id,
      json: operation.json,
      operation: [
        "custom_json",
        {
          required_auths: operation.required_auths,
          required_posting_auths: operation.required_posting_auths,
          id: operation.id,
          json: operation.json,
        },
      ],
    };
  }

  /** Sign a raw Hive Engine contract action and broadcast it over RPC. */
  protected async dispatchEngineAction(input: {
    from: AccountReference;
    engineAction: HiveEngineContractAction;
    account?: string;
    id: string;
  }): Promise<IssuerTransactionResult> {
    const preview = this.previewEngineAction(input);
    return this.signAndBroadcast(
      { alias: preview.alias, account: preview.account },
      preview.operation,
      input.account,
    );
  }

  /** Assemble, sign with the configured private key and broadcast via hive.rpc. */
  protected async signAndBroadcast(
    resolved: Pick<ResolvedAccount, "alias" | "account">,
    customJsonOperation: unknown[],
    account?: string,
  ): Promise<IssuerTransactionResult> {
    // Private key resolution happens here and nowhere else: as late as
    // possible, only for the alias actually being used, and never cached.
    const signing: ResolvedSigningAccount = this.context.resolveSigningAccount(resolved.alias);

    const assembler = new TransactionAssembler(this.context.rpc);
    const unsigned = await assembler.build([customJsonOperation]);
    const signed = signTransaction(unsigned, signing.key);

    let raw: unknown;
    try {
      raw = await this.context.rpc.call("condenser_api.broadcast_transaction_synchronous", [
        signed,
      ]);
    } catch (error) {
      if (error instanceof HiveSdkError) throw error;
      throw new HiveSdkError("BROADCAST_ERROR", "Broadcasting the transaction failed", {
        message: (error as Error)?.message,
      });
    }

    const transactionId = isPlainObject(raw) && typeof raw["id"] === "string" ? raw["id"] : undefined;

    return {
      success: true,
      ...(transactionId ? { transactionId } : {}),
      ...(account ? { account } : {}),
      raw,
    };
  }

  protected async dispatch(input: DispatchInput): Promise<IssuerTransactionResult> {
    const preview = this.previewProtocolAction(input);
    return this.signAndBroadcast(
      { alias: preview.alias, account: preview.account },
      preview.operation,
      input.account,
    );
  }
}
