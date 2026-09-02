/** Beacon (https://beacon.peakd.com) node-health types. */

export const DEFAULT_BEACON_URL = "https://beacon.peakd.com/api/nodes";

export interface BeaconNodeRaw {
  name: string;
  endpoint: string;
  version: string;
  score: number;
  updated_at: string;
  success: number;
  fail: number;
  lastBlock: number | null;
  features?: string[];
  apps?: { success: number; fail: number };
  [key: string]: unknown;
}

/** Normalized node record returned by BeaconClient. */
export interface BeaconNode {
  name: string;
  endpoint: string;
  version: string;
  score: number;
  updatedAt: string;
  success: number;
  fail: number;
  lastBlock: number | null;
  features: string[];
  raw: BeaconNodeRaw;
}

export interface BeaconFetchOptions {
  signal?: AbortSignal;
  /** Minimum score to keep. Default 0 (no filtering). */
  minScore?: number;
  /** Only keep nodes exposing all of these features. */
  requireFeatures?: string[];
  /** Max nodes returned, after sorting by score desc. */
  limit?: number;
}
