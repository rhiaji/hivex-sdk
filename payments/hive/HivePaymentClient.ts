import type { AccountReference } from "../../configs/AccountReference";
import { IssuerDispatcher } from "../../issuer/IssuerDispatcher";
import type { IssuerTransactionResult } from "../../issuer/types";
import { requireAccountReference } from "../../configs/AccountReference";
import { hivePaymentBuilder, type HivePaymentInput } from "./HivePaymentBuilder";

export interface HiveTransferInput<T = Record<string, unknown>> extends HivePaymentInput<T> {
  /** Key-free account reference of the sending account. */
  from: AccountReference;
}

/** Offline preview of a native transfer — no keys, no network. */
export interface HiveTransferPreview {
  alias: string;
  account: string;
  destination: string;
  amount: string;
  memo: string;
  operation: unknown[];
}

/**
 * Backend native HIVE / HBD payments: alias -> account -> transfer -> sign ->
 * broadcast. Private keys are resolved as late as possible, inside the signing
 * step, and never cached.
 */
export class HivePaymentClient extends IssuerDispatcher {
  /** Build the exact transfer operation without touching keys or the network. */
  build<T = Record<string, unknown>>(input: HiveTransferInput<T>): HiveTransferPreview {
    const reference = requireAccountReference(input?.from);
    const resolved = this.context.resolveAccount(reference.alias);
    const built = hivePaymentBuilder.build<T>(input);

    return {
      alias: resolved.alias,
      account: resolved.account,
      destination: built.account,
      amount: built.amount,
      memo: built.memo,
      operation: [
        "transfer",
        {
          from: resolved.account,
          to: built.account,
          amount: built.amount,
          memo: built.memo,
        },
      ],
    };
  }

  /** Sign and broadcast a native transfer carrying a standardized trigger. */
  async transfer<T = Record<string, unknown>>(
    input: HiveTransferInput<T>,
  ): Promise<IssuerTransactionResult> {
    const preview = this.build<T>(input);
    return this.signAndBroadcast(
      { alias: preview.alias, account: preview.account },
      preview.operation,
      preview.destination,
    );
  }
}
