/**
 * Hive Custom JSON Transaction SDK and Reader.
 * Public API surface — keep this clean for future npm extraction.
 *
 * HiveClient
 *  ├── configs   named configurations + account aliases + env references
 *  ├── signer    transaction signing (never key storage)
 *  ├── rpc       blockchain communication
 *  ├── keychain  frontend signing
 *  ├── stream    blockchain streaming
 *  ├── reader    transaction reading + the unified stream engine
 *  ├── issuer    token + nft operations
 *  └── payments  native + Layer 2 payments with triggers
 */

export { HiveClient } from "./core/HiveClient";

export { ConfigRegistry } from "./configs/ConfigRegistry";
export { AccountResolver, validateAccountConfig } from "./configs/AccountResolver";
export {
  defaultEnvironmentResolver,
  createEnvironmentResolver,
  requireEnvValue,
  isPresentEnvValue,
} from "./environment/EnvironmentResolver";
export type { EnvironmentResolver } from "./environment/types";
export {
  HiveConfigurationError,
  HiveAccountNotFoundError,
  HiveAccountResolutionError,
  HiveEnvironmentVariableMissingError,
  HiveSigningKeyMissingError,
  HiveSigningError,
} from "./errors/index";
export { ConfigContext } from "./configs/ConfigContext";
export { DEFAULT_CONFIG_NAME } from "./configs/types";
export { isAccountReference } from "./configs/AccountReference";
export type { AccountReference } from "./configs/AccountReference";

export { KeyRegistry } from "./keys/KeyRegistry";
export { createKeyProvider } from "./keys/KeyProvider";

export { Signer } from "./signer/Signer";
export { UnavailableSigner, createLocalKeySigner } from "./signer/TransactionSigner";

export { IssuerClient } from "./issuer/IssuerClient";
export { IssuerDispatcher } from "./issuer/IssuerDispatcher";
export { TokenIssuer } from "./issuer/token/TokenIssuer";
export { NftIssuer } from "./issuer/nft/NftIssuer";

export {
  ActionPayloadBuilder,
  actionPayloadBuilder,
  ActionPayloadParser,
  actionPayloadParser,
  ActionPayloadValidator,
  actionPayloadValidator,
  assertActionName,
  normalizeActionMetadata,
  isActionPayload,
} from "./protocol/index";
export type { ActionPayload, ActionPayloadInput } from "./protocol/types";

export * from "./payments/index";

export { RpcClient } from "./rpc/RpcClient";
export type { RpcClientOptions } from "./rpc/RpcClient";
export { NodeSelector } from "./rpc/NodeSelector";
export type { NodeSelectorOptions } from "./rpc/NodeSelector";
export { CustomJsonBuilder } from "./transaction/CustomJsonBuilder";
export { TransactionAssembler, refBlockPrefix } from "./transaction/TransactionAssembler";
export { CustomJsonParser } from "./parser/CustomJsonParser";
export { KeychainClient } from "./keychain/KeychainClient";
export {
  KeychainIssuer,
  KeychainEngineIssuer,
  KeychainTokenIssuer,
  KeychainNftIssuer,
} from "./keychain/KeychainIssuer";
export type { KeychainIssuerOptions } from "./keychain/KeychainIssuer";
export { BlockStreamer } from "./stream/BlockStreamer";
export { BlockWatcher } from "./stream/BlockWatcher";
export { CustomJsonWatcher } from "./stream/CustomJsonWatcher";
export { BeaconClient } from "./beacon/BeaconClient";
export { TransactionReader } from "./reader/TransactionReader";
export { ReaderClient } from "./reader/ReaderClient";
export { StreamEngine } from "./reader/stream/StreamEngine";
export { FilterRegistry } from "./reader/stream/FilterRegistry";
export { OperationParser } from "./reader/stream/OperationParser";
export { HiveSdkError } from "./types/index";
export { DEFAULT_RPC_ENDPOINT } from "./rpc/types";
export { DEFAULT_BEACON_URL } from "./beacon/types";

export type {
  HiveClientConfig,
  HiveAuthority,
  CustomJsonPayload,
  CustomJsonInput,
  CustomJsonEvent,
  CustomJsonOperationValue,
  HiveSdkErrorCode,
} from "./types/index";

export type { HiveClientOptions } from "./core/types";

export type {
  HiveConfig,
  HiveConfigSummary,
  HiveAccountConfig,
  ResolvedAccount,
  ResolvedSigningAccount,
} from "./configs/types";

export type { KeyProvider, KeyRegistryOptions } from "./keys/types";

export type {
  SignRequest,
  SignResult,
  TransactionSigner,
  UnsignedTransaction,
} from "./signer/types";

export type {
  IssuerTransactionResult,
  IssuerOperationPreview,
  IssuerOperationOptions,
} from "./issuer/types";
export type { IssuerContext } from "./issuer/IssuerDispatcher";
export type { TokenMintInput, TokenTransferInput, TokenBurnInput } from "./issuer/token/types";
export { NftTransactionBuilder, countNftInstances } from "./issuer/nft/NftTransactionBuilder";
export {
  NftValidationError,
  NftSymbolError,
  NftTransferLimitError,
  NftIssuanceError,
  NftTransferError,
  NftAccountResolutionError,
} from "./issuer/nft/errors";
export type {
  NftAccountType,
  NftMintInput,
  NftMintInstance,
  NftMintMultipleInput,
  NftTransferInput,
  NftTransferItem,
  NftTransactionResult,
  NftBurnInput,
  NftLockNfts,
} from "./issuer/nft/types";
export {
  HIVE_ENGINE_CUSTOM_JSON_ID,
  HIVE_ENGINE_AUTHORITY,
  TOKEN_CONTRACT,
  TOKEN_ACTIONS,
  TokenActionBuilder,
  NftActionBuilder,
  NFT_CONTRACT,
  NFT_ACTIONS,
  NFT_MAX_TRANSFER_INSTANCES,
  NFT_MAX_ISSUE_MULTIPLE_INSTANCES,
} from "./engine/index";
export type {
  HiveEngineContractAction,
  NftContractActionName,
  TokenContractActionName,
  TokenActionInput,
  TokenBurnActionInput,
} from "./engine/index";

export type {
  DynamicGlobalProperties,
  HiveBlock,
  HiveOperation,
  HiveTransaction,
  NumberedBlock,
} from "./rpc/types";

export type {
  BuiltCustomJsonOperation,
  CustomJsonOperationInput,
} from "./transaction/types";

export {
  KeychainPayments,
  KeychainHivePayments,
  KeychainEnginePayments,
} from "./keychain/KeychainPayments";
export type {
  KeychainHivePaymentInput,
  KeychainEnginePaymentInput,
} from "./keychain/KeychainPayments";

export type {
  KeychainTransferInput,
  KeychainCustomJsonInput,
  KeychainCustomJsonRawInput,
  KeychainResult,
  KeychainResponse,
} from "./keychain/types";

export type { BlockStreamOptions, CustomJsonStreamOptions } from "./stream/types";
export type { ReadTransactionInput, TransactionReadResult } from "./reader/types";
export type { ReaderClientOptions } from "./reader/ReaderClient";
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
export type { BeaconNode, BeaconNodeRaw, BeaconFetchOptions } from "./beacon/types";
