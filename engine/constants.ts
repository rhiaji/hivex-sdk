/** Centralized Hive Engine identifiers. Never repeat these literals elsewhere. */

/** custom_json id used by the Hive Engine sidechain (mainnet). */
export const HIVE_ENGINE_CUSTOM_JSON_ID = "ssc-mainnet-hive";

/** Hive Engine NFT smart contract name. */
export const NFT_CONTRACT = "nft";

/** Hive Engine NFT contract actions. */
export const NFT_ACTIONS = {
  create: "create",
  issue: "issue",
  issueMultiple: "issueMultiple",
  transfer: "transfer",
} as const;

export type NftContractActionName = (typeof NFT_ACTIONS)[keyof typeof NFT_ACTIONS];

/** Documented Hive Engine limits. */
export const NFT_MAX_TRANSFER_INSTANCES = 50;
export const NFT_MAX_ISSUE_MULTIPLE_INSTANCES = 10;

/** Fallback NFT creation fee in BEE when the sidechain params cannot be read. */
export const DEFAULT_NFT_CREATION_FEE = "100";

/** Documented Hive Engine NFT creation limits. */
export const NFT_NAME_MAX_LENGTH = 50;
export const NFT_SYMBOL_MAX_LENGTH = 10;
export const NFT_ORG_NAME_MAX_LENGTH = 50;
export const NFT_PRODUCT_NAME_MAX_LENGTH = 50;
export const NFT_URL_MAX_LENGTH = 255;
export const NFT_MAX_SUPPLY_LIMIT = "9007199254740991";

/** Hive Engine fungible token smart contract name. */
export const TOKEN_CONTRACT = "tokens";

/** Hive Engine token contract actions. */
export const TOKEN_ACTIONS = {
  create: "create",
  issue: "issue",
  transfer: "transfer",
  burn: "burn",
} as const;

/** Sidechain fee token: creating a token is paid in BEE. */
export const BEE_SYMBOL = "BEE";

/** Fallback creation fee when the sidechain params table cannot be read. */
export const DEFAULT_TOKEN_CREATION_FEE = "100";

/** Documented Hive Engine token creation limits. */
export const TOKEN_NAME_MAX_LENGTH = 50;
export const TOKEN_SYMBOL_MAX_LENGTH = 10;
export const TOKEN_URL_MAX_LENGTH = 255;
export const TOKEN_PRECISION_MAX = 8;
export const TOKEN_MAX_SUPPLY_LIMIT = "9007199254740991";

export type TokenContractActionName = (typeof TOKEN_ACTIONS)[keyof typeof TOKEN_ACTIONS];

/** Hive Engine contract actions always require the active authority. */
export const HIVE_ENGINE_AUTHORITY = "active" as const;
