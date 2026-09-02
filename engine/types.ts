/** Shared Hive Engine (sidechain) types. */

/** A single Hive Engine smart contract action. */
export interface HiveEngineContractAction<TPayload = Record<string, unknown>> {
  contractName: string;
  contractAction: string;
  contractPayload: TPayload;
}
