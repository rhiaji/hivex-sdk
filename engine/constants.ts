/** Centralized Hive Engine identifiers. Never repeat these literals elsewhere. */

/** custom_json id used by the Hive Engine sidechain (mainnet). */
export const HIVE_ENGINE_CUSTOM_JSON_ID = "ssc-mainnet-hive";

/** Hive Engine NFT smart contract name. */
export const NFT_CONTRACT = "nft";

/** Hive Engine NFT contract actions. */
export const NFT_ACTIONS = {
  issue: "issue",
  issueMultiple: "issueMultiple",
  transfer: "transfer",
} as const;

export type NftContractActionName = (typeof NFT_ACTIONS)[keyof typeof NFT_ACTIONS];

/** Documented Hive Engine limits. */
export const NFT_MAX_TRANSFER_INSTANCES = 50;
export const NFT_MAX_ISSUE_MULTIPLE_INSTANCES = 10;

/** Hive Engine fungible token smart contract name. */
export const TOKEN_CONTRACT = "tokens";

/** Hive Engine token contract actions. */
export const TOKEN_ACTIONS = {
  issue: "issue",
  transfer: "transfer",
  burn: "burn",
} as const;

export type TokenContractActionName = (typeof TOKEN_ACTIONS)[keyof typeof TOKEN_ACTIONS];

/** Hive Engine contract actions always require the active authority. */
export const HIVE_ENGINE_AUTHORITY = "active" as const;
