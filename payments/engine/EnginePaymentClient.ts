import type { AccountReference } from "../../configs/AccountReference";
import { IssuerDispatcher } from "../../issuer/IssuerDispatcher";
import type { IssuerOperationPreview, IssuerTransactionResult } from "../../issuer/types";
import { enginePaymentBuilder, type EnginePaymentInput } from "./EnginePaymentBuilder";

export interface EngineTransferInput<T = Record<string, unknown>> extends EnginePaymentInput<T> {
  from: AccountReference;
}

/**
 * Backend Hive Engine (Layer 2) payments.
 *
 * Broadcasting only proves the custom_json reached Hive. Use
 * `hive.payments.validate()` to confirm the sidechain actually executed it.
 */
export class EnginePaymentClient extends IssuerDispatcher {
  /** Offline preview of the sidechain transfer operation. */
  build<T = Record<string, unknown>>(input: EngineTransferInput<T>): IssuerOperationPreview {
    const built = enginePaymentBuilder.build<T>(input);
    return this.previewEngineAction({
      from: input.from,
      engineAction: built.engineAction,
      account: input.account,
      id: built.id,
    });
  }

  /** Sign and broadcast the Layer 2 transfer. */
  async transfer<T = Record<string, unknown>>(
    input: EngineTransferInput<T>,
  ): Promise<IssuerTransactionResult> {
    const built = enginePaymentBuilder.build<T>(input);
    return this.dispatchEngineAction({
      from: input.from,
      engineAction: built.engineAction,
      account: input.account,
      id: built.id,
    });
  }
}
