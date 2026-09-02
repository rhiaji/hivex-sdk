import { actionPayloadBuilder } from "../protocol/index";
import { HiveSdkError, type CustomJsonInput, type CustomJsonPayload } from "../types/index";
import { assertNonEmptyString, isPlainObject } from "../utils/validation";
import type { BuiltCustomJsonOperation, CustomJsonOperationInput } from "./types";

/**
 * Converts developer-friendly input into the strict standardized payload
 * `{ action, metadata }` and into a full Hive custom_json operation.
 * Never mutates the input.
 */
export class CustomJsonBuilder {
  /** Build the standardized payload; metadata defaults to null. */
  buildPayload<T = Record<string, unknown>>(input: CustomJsonInput<T>): CustomJsonPayload<T> {
    if (!isPlainObject(input as unknown)) {
      throw new HiveSdkError("VALIDATION_ERROR", "Custom JSON input must be an object");
    }
    assertNonEmptyString(input.action, "action");

    // Single shared implementation of the standardized `{ action, metadata }`
    // payload, identical for custom_json and for payment triggers.
    return actionPayloadBuilder.build<T>({
      action: input.action,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    });
  }

  /** Serialize the standardized payload to the Hive `json` string. */
  serialize<T = Record<string, unknown>>(payload: CustomJsonPayload<T>): string {
    return actionPayloadBuilder.serialize(payload);
  }

  /** Build the complete Hive custom_json operation body. */
  buildOperation<T = Record<string, unknown>>(
    input: CustomJsonOperationInput<T>,
  ): BuiltCustomJsonOperation<T> {
    assertNonEmptyString(input.username, "username");
    assertNonEmptyString(input.id, "id");

    const authority = input.authority ?? "posting";
    if (authority !== "posting" && authority !== "active") {
      throw new HiveSdkError("VALIDATION_ERROR", `"authority" must be "posting" or "active"`);
    }

    const payload = this.buildPayload<T>({
      action: input.action,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    });

    return {
      required_auths: authority === "active" ? [input.username] : [],
      required_posting_auths: authority === "posting" ? [input.username] : [],
      id: input.id,
      json: this.serialize(payload),
      payload,
    };
  }
}
