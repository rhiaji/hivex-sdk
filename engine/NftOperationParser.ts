import { readOperation } from "../operations/detectOperation";
import { safeJsonParse } from "../utils/helpers";
import { isPlainObject } from "../utils/validation";
import { DEFAULT_BURN_ACCOUNT } from "./burn";
import { HIVE_ENGINE_CUSTOM_JSON_ID, NFT_ACTIONS, NFT_CONTRACT } from "./constants";

/** One NFT symbol plus the instance ids it carries. */
export interface NftInstanceRef {
  symbol: string;
  ids: string[];
}

/** Normalized Hive Engine NFT operation read from a custom_json. */
export interface NormalizedNftOperation {
  contract: typeof NFT_CONTRACT;
  /** "issue" | "issueMultiple" | "transfer". */
  action: string;
  /** Signing account of the custom_json. */
  from: string;
  /** Recipient, null for issue actions that carry several instances. */
  to: string | null;
  /** Instances touched by the operation, in payload order. */
  nfts: NftInstanceRef[];
  /**
   * True when the recipient is the burn destination. A burn IS a transfer to
   * `"null"` — the protocol data decides, not an assumption.
   */
  burn: boolean;
  /** Contract payload exactly as broadcast. */
  payload: Record<string, unknown>;
}

/**
 * THE canonical NFT operation reader.
 *
 * Hive Engine NFT actions are `custom_json` operations. Layer 1 inclusion says
 * nothing about sidechain execution: like Layer 2 payments, success must be
 * confirmed with `EnginePaymentValidator`.
 */
export class NftOperationParser {
  /** Normalize an NFT contract action, or null when the op is something else. */
  parseOperation(operation: unknown): NormalizedNftOperation | null {
    const detected = readOperation(operation);
    if (!detected || detected.type !== "custom_json") return null;
    if (detected.value["id"] !== HIVE_ENGINE_CUSTOM_JSON_ID) return null;

    const from = resolveSender(detected.value);
    if (!from) return null;

    const parsed = safeJsonParse(
      typeof detected.value["json"] === "string" ? detected.value["json"] : "",
    );
    if (!parsed.ok) return null;

    const actions = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
    for (const action of actions) {
      const normalized = this.readAction(action, from);
      if (normalized) return normalized;
    }
    return null;
  }

  private readAction(value: unknown, from: string): NormalizedNftOperation | null {
    if (!isPlainObject(value)) return null;
    if (value["contractName"] !== NFT_CONTRACT) return null;
    const action = value["contractAction"];
    if (typeof action !== "string") return null;
    if (!Object.values(NFT_ACTIONS).includes(action as never)) return null;

    const payload = value["contractPayload"];
    if (!isPlainObject(payload)) return null;

    const to = typeof payload["to"] === "string" ? payload["to"] : null;
    const nfts =
      action === NFT_ACTIONS.transfer ? readNfts(payload["nfts"]) : readIssuedInstances(payload);

    return {
      contract: NFT_CONTRACT,
      action,
      from,
      to,
      nfts,
      burn: action === NFT_ACTIONS.transfer && to === DEFAULT_BURN_ACCOUNT,
      payload,
    };
  }
}

function readNfts(value: unknown): NftInstanceRef[] {
  if (!Array.isArray(value)) return [];
  const refs: NftInstanceRef[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const symbol = item["symbol"];
    if (typeof symbol !== "string") continue;
    const ids = Array.isArray(item["ids"])
      ? item["ids"].filter((id): id is string => typeof id === "string")
      : [];
    refs.push({ symbol, ids });
  }
  return refs;
}

/** `issue` carries one symbol; `issueMultiple` carries an `instances` array. */
function readIssuedInstances(payload: Record<string, unknown>): NftInstanceRef[] {
  const instances = payload["instances"];
  if (Array.isArray(instances)) {
    const refs: NftInstanceRef[] = [];
    for (const instance of instances) {
      if (!isPlainObject(instance)) continue;
      const symbol = instance["symbol"];
      if (typeof symbol === "string") refs.push({ symbol, ids: [] });
    }
    return refs;
  }
  const symbol = payload["symbol"];
  return typeof symbol === "string" ? [{ symbol, ids: [] }] : [];
}

function resolveSender(value: Record<string, unknown>): string | null {
  const active = value["required_auths"];
  if (Array.isArray(active) && typeof active[0] === "string") return active[0];
  const posting = value["required_posting_auths"];
  if (Array.isArray(posting) && typeof posting[0] === "string") return posting[0];
  return null;
}

export const nftOperationParser = new NftOperationParser();
