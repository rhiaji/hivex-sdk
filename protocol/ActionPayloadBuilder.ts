import { assertActionName, normalizeActionMetadata } from "./ActionPayloadValidator";
import type { ActionPayload, ActionPayloadInput } from "./types";

/**
 * Builds and serializes the standardized `{ action, metadata }` payload.
 * Deterministic: no timestamps, no random fields, no reordering.
 */
export class ActionPayloadBuilder {
  build<T = Record<string, unknown>>(input: ActionPayloadInput<T>): ActionPayload<T> {
    assertActionName(input?.action);
    const metadata = normalizeActionMetadata<T>(input?.metadata);
    return { action: input.action, metadata };
  }

  /** Deterministic JSON serialization of the standardized payload. */
  serialize<T = Record<string, unknown>>(payload: ActionPayload<T>): string {
    return JSON.stringify(payload);
  }

  /** Build and serialize in one step. */
  buildSerialized<T = Record<string, unknown>>(input: ActionPayloadInput<T>): string {
    return this.serialize(this.build<T>(input));
  }
}

export const actionPayloadBuilder = new ActionPayloadBuilder();
