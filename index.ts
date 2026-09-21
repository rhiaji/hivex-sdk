/**
 * hivexph-sdk — public API surface.
 *
 * This file is the ONE entry point of the package. Everything a consumer is
 * meant to touch is exported here; every other folder is internal and may
 * change without notice. There are no secondary entry points, no deep import
 * paths, and no re-export shims.
 *
 * hive = new HiveClient(options)
 *  ├── configs         named configurations + account aliases + env references
 *  ├── accounts        key-free account references
 *  ├── rpc             blockchain communication
 *  ├── blocks.watch()  the single canonical block stream
 *  ├── reader          transaction reading + the unified stream engine
 *  ├── customJson      build / broadcast / watch standardized payloads
 *  ├── payments        native + Layer 2 payments with triggers
 *  ├── issuer          backend token + NFT operations (signs with a key)
 *  ├── keychain        browser transactions through Hive Keychain
 *  └── keychainIssuer  browser token + NFT operations through Hive Keychain
 */

/* ── Entry point ──────────────────────────────────────────────────────── */

export { HiveClient } from "./core/HiveClient";
export type { HiveClientOptions } from "./core/types";
export type {
  HiveClientConfig,
  HiveAuthority,
  CustomJsonPayload,
  CustomJsonInput,
  CustomJsonEvent,
  CustomJsonOperationValue,
} from "./types/index";

/* ── Errors ───────────────────────────────────────────────────────────── */

export { HiveSdkError } from "./types/index";
export type { HiveSdkErrorCode } from "./types/index";
export {
  HiveConfigurationError,
  HiveAccountNotFoundError,
  HiveAccountResolutionError,
  HiveEnvironmentVariableMissingError,
  HiveSigningKeyMissingError,
  HiveSigningError,
} from "./errors/index";
export {
  NftValidationError,
  NftSymbolError,
  NftTransferLimitError,
  NftIssuanceError,
  NftTransferError,
  NftAccountResolutionError,
} from "./issuer/nft/errors";

/* ── Configuration ────────────────────────────────────────────────────── */

export { isAccountReference } from "./configs/AccountReference";
export type { AccountReference } from "./configs/AccountReference";
export type {
  HiveConfig,
  HiveAccountConfig,
  ResolvedAccount,
} from "./configs/types";
export type { HiveConfigs } from "./core/HiveClient";
export type { HiveRuntimeOptions } from "./core/types";
export { createEnvironmentResolver } from "./environment/EnvironmentResolver";
export type { EnvironmentResolver } from "./environment/types";

/* ── RPC + chain types ────────────────────────────────────────────────── */

export { DEFAULT_RPC_ENDPOINT } from "./rpc/types";
export { DEFAULT_BEACON_URL } from "./beacon/types";
export type { RpcClientOptions } from "./rpc/RpcClient";
export type {
  DynamicGlobalProperties,
  HiveBlock,
  HiveOperation,
  HiveTransaction,
} from "./rpc/types";
export type { BeaconNode, BeaconFetchOptions } from "./beacon/types";

/* ── Reading: blocks, transactions, streams ───────────────────────────── */

export type { StreamEngine } from "./reader/stream/StreamEngine";
export type {
  NormalizedBlock,
  NormalizedTransaction,
  NormalizedOperation,
} from "./stream/normalizeBlock";
export type { BlockStreamOptions, CustomJsonStreamOptions } from "./stream/types";
export type { ReaderClientOptions } from "./reader/ReaderClient";
export type {
  ReadTransactionInput,
  TransactionResult,
  TransactionOperationResult,
  TransactionOperationPosition,
  CustomJsonOperationResult,
  PaymentOperationResult,
  NftOperationResult,
  UnknownOperationResult,
} from "./reader/types";
export type {
  CustomJsonFilter,
  CustomJsonStreamEvent,
  PaymentFilter,
  PaymentSource,
  PaymentStreamEvent,
  StreamEvent,
  StreamEventPosition,
  StreamEventType,
  StreamHandler,
  StreamSubscription,
  UnifiedStreamOptions,
} from "./reader/stream/types";

/* ── Standardized Custom JSON envelope ────────────────────────────────── */

export { validateActionPayload, isActionPayload } from "./protocol/index";
export type { ActionPayload, ActionPayloadInput } from "./protocol/types";
export type { ActionPayloadValidation } from "./protocol/ActionPayloadValidator";
export type { ActionPayloadParseResult } from "./protocol/ActionPayloadParser";
export type {
  BuiltCustomJsonOperation,
  CustomJsonOperationInput,
  UnsignedTransaction,
  SignedTransaction,
} from "./transaction/types";

/* ── Payments ─────────────────────────────────────────────────────────── */

export {
  NATIVE_PRECISION,
  NATIVE_SYMBOLS,
  formatNativeAsset,
  parseNativeAsset,
  quantitiesEqual,
} from "./payments/amount";
export type { NativeSymbol } from "./payments/amount";
export type { HivePaymentInput, BuiltHiveTransfer } from "./payments/hive/HivePaymentBuilder";
export type { HiveTransferInput, HiveTransferPreview } from "./payments/hive/HivePaymentClient";
export type { EnginePaymentInput, BuiltEngineTransfer } from "./payments/engine/EnginePaymentBuilder";
export type { EngineTransferInput } from "./payments/engine/EnginePaymentClient";
export type {
  EngineExecutionResult,
  EngineExecutionExpectation,
} from "./payments/engine/EnginePaymentValidator";
export type { EngineRpcOptions, EngineTransactionInfo } from "./payments/engine/EngineRpcClient";
export type {
  PaymentNetwork,
  PaymentStatus,
  PaymentTrigger,
  PaymentTransfer,
  ParsedPayment,
  PaymentExpectation,
  PaymentValidateInput,
  PaymentValidationResult,
  PaymentStreamFilters,
  PaymentStreamOptions,
} from "./payments/types";

/* ── Backend writing: issuer ──────────────────────────────────────────── */

export { HIVE_ENGINE_CUSTOM_JSON_ID } from "./engine/index";
export type { HiveEngineContractAction } from "./engine/index";
export {
  BEE_SYMBOL,
  DEFAULT_TOKEN_CREATION_FEE,
  TOKEN_NAME_MAX_LENGTH,
  TOKEN_SYMBOL_MAX_LENGTH,
  TOKEN_URL_MAX_LENGTH,
  TOKEN_PRECISION_MAX,
  TOKEN_MAX_SUPPLY_LIMIT,
  TokenCreationChecker,
  NftCreationChecker,
  DEFAULT_NFT_CREATION_FEE,
  NFT_NAME_MAX_LENGTH,
  NFT_SYMBOL_MAX_LENGTH,
  NFT_ORG_NAME_MAX_LENGTH,
  NFT_PRODUCT_NAME_MAX_LENGTH,
  NFT_URL_MAX_LENGTH,
  NFT_MAX_SUPPLY_LIMIT,
} from "./engine/index";
export type {
  TokenCreateActionInput,
  TokenCreationCheck,
  TokenCreationCheckInput,
  EngineTokenRow,
  NftCreateActionInput,
  NftCreationCheck,
  NftCreationCheckInput,
  EngineNftRow,
} from "./engine/index";
export type {
  IssuerTransactionResult,
  IssuerOperationPreview,
  IssuerOperationOptions,
} from "./issuer/types";
export type {
  TokenCreateInput,
  TokenIssueInput,
  TokenTransferInput,
  TokenBurnInput,
} from "./issuer/token/types";
export type {
  NftCreateInput,
  NftAccountType,
  NftIssueInput,
  NftIssueInstance,
  NftIssueMultipleInput,
  NftTransferInput,
  NftTransferItem,
  NftTransactionResult,
  NftBurnInput,
  NftLockNfts,
} from "./issuer/nft/types";
export {
  NFT_MAX_TRANSFER_INSTANCES,
  NFT_MAX_ISSUE_MULTIPLE_INSTANCES,
} from "./engine/index";

/* ── Frontend writing: Hive Keychain ──────────────────────────────────── */

export type {
  KeychainIssuerOptions,
  KeychainTokenCreateInput,
  KeychainNftCreateInput,
} from "./keychain/KeychainIssuer";
export type {
  KeychainHivePaymentInput,
  KeychainEnginePaymentInput,
} from "./keychain/KeychainPayments";
export type {
  KeychainTransferInput,
  KeychainCustomJsonInput,
  KeychainCustomJsonRawInput,
  KeychainSignInInput,
  KeychainSignInResult,
  KeychainResult,
  KeychainResponse,
} from "./keychain/types";
