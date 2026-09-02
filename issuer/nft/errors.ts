import { HiveSdkError } from "../../types/index";

/**
 * NFT-specific errors. They never carry private keys or signing credentials —
 * only the offending public input.
 */
export class NftValidationError extends HiveSdkError {
  constructor(message: string, raw?: unknown) {
    super("NFT_VALIDATION_ERROR", message, raw);
    this.name = "NftValidationError";
  }
}

export class NftSymbolError extends HiveSdkError {
  constructor(message: string, raw?: unknown) {
    super("NFT_SYMBOL_ERROR", message, raw);
    this.name = "NftSymbolError";
  }
}

export class NftTransferLimitError extends HiveSdkError {
  constructor(message: string, raw?: unknown) {
    super("NFT_TRANSFER_LIMIT_ERROR", message, raw);
    this.name = "NftTransferLimitError";
  }
}

export class NftIssuanceError extends HiveSdkError {
  constructor(message: string, raw?: unknown) {
    super("NFT_ISSUANCE_ERROR", message, raw);
    this.name = "NftIssuanceError";
  }
}

export class NftTransferError extends HiveSdkError {
  constructor(message: string, raw?: unknown) {
    super("NFT_TRANSFER_ERROR", message, raw);
    this.name = "NftTransferError";
  }
}

export class NftAccountResolutionError extends HiveSdkError {
  constructor(message: string, raw?: unknown) {
    super("NFT_ACCOUNT_RESOLUTION_ERROR", message, raw);
    this.name = "NftAccountResolutionError";
  }
}

export class NftBurnError extends HiveSdkError {
  constructor(message: string, raw?: unknown) {
    super("NFT_BURN_ERROR", message, raw);
    this.name = "NftBurnError";
  }
}
