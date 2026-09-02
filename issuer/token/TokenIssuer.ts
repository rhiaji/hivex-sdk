import { IssuerDispatcher } from "../IssuerDispatcher";
import { HiveSdkError } from "../../types/index";
import { assertNonEmptyString } from "../../utils/validation";
import type { IssuerOperationPreview, IssuerTransactionResult } from "../types";
import { resolveBurnAccount } from "../../engine/index";
import type { TokenBurnInput, TokenMintInput, TokenTransferInput } from "./types";

/** Quantities must be decimal strings — never JavaScript floats. */
function assertQuantity(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value.trim())) {
    throw new HiveSdkError(
      "VALIDATION_ERROR",
      `"quantity" must be a decimal string such as "100" or "100.000"`,
    );
  }
}

function assertSymbol(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Z0-9.]{1,32}$/.test(value.trim())) {
    throw new HiveSdkError("VALIDATION_ERROR", `"symbol" must be an uppercase token symbol`);
  }
}

/**
 * Generic backend token operations. `from` is a configuration account alias;
 * `account` is always the destination blockchain account.
 *
 * Every method here signs with a resolved private key and broadcasts over RPC.
 * Use the matching `build*` method for an offline, key-free payload preview.
 */
export class TokenIssuer extends IssuerDispatcher {
  private mintInput(input: TokenMintInput) {
    assertSymbol(input.symbol);
    assertNonEmptyString(input.account, "account");
    assertQuantity(input.quantity);
    return {
      from: input.from,
      action: "token.mint",
      account: input.account,
      metadata: {
        symbol: input.symbol,
        account: input.account,
        quantity: input.quantity,
        ...(input.memo === undefined ? {} : { memo: input.memo }),
      },
      ...(input.id ? { id: input.id } : {}),
    };
  }

  private transferInput(input: TokenTransferInput) {
    assertSymbol(input.symbol);
    assertNonEmptyString(input.account, "account");
    assertQuantity(input.quantity);
    return {
      from: input.from,
      action: "token.transfer",
      account: input.account,
      metadata: {
        symbol: input.symbol,
        account: input.account,
        quantity: input.quantity,
        ...(input.memo === undefined ? {} : { memo: input.memo }),
      },
      ...(input.id ? { id: input.id } : {}),
    };
  }

  /** Burn is a transfer to the burn destination (defaults to `"null"`). */
  private burnInput(input: TokenBurnInput) {
    return this.transferInput({
      from: input.from,
      symbol: input.symbol,
      account: resolveBurnAccount(input.account),
      quantity: input.quantity,
      ...(input.memo === undefined ? {} : { memo: input.memo }),
      ...(input.id ? { id: input.id } : {}),
    });
  }

  /** Offline preview of a mint operation. No keys, no network. */
  buildMint(input: TokenMintInput): IssuerOperationPreview {
    return this.previewProtocolAction(this.mintInput(input));
  }

  /** Offline preview of a transfer operation. No keys, no network. */
  buildTransfer(input: TokenTransferInput): IssuerOperationPreview {
    return this.previewProtocolAction(this.transferInput(input));
  }

  /** Offline preview of a burn operation. No keys, no network. */
  buildBurn(input: TokenBurnInput): IssuerOperationPreview {
    return this.previewProtocolAction(this.burnInput(input));
  }

  async mint(input: TokenMintInput): Promise<IssuerTransactionResult> {
    return this.dispatch(this.mintInput(input));
  }

  async transfer(input: TokenTransferInput): Promise<IssuerTransactionResult> {
    return this.dispatch(this.transferInput(input));
  }

  async burn(input: TokenBurnInput): Promise<IssuerTransactionResult> {
    return this.dispatch(this.burnInput(input));
  }
}
