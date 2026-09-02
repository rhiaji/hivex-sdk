import type { CustomJsonParser } from "../parser/CustomJsonParser";
import type { StreamEngine } from "../reader/stream/StreamEngine";
import type { CustomJsonStreamEvent, UnifiedStreamOptions } from "../reader/stream/types";
import type { CustomJsonEvent } from "../types/index";
import { assertNonEmptyString } from "../utils/validation";
import { iterateEngine } from "../utils/streamQueue";
import type { CustomJsonStreamOptions } from "./types";

/** Creates a stream engine bound to the caller's options. */
export type StreamEngineFactory = (options: UnifiedStreamOptions) => StreamEngine;

/**
 * `hive.customJson` — parsing plus a filtered view of the core block stream.
 *
 * `watch()` is NOT a second blockchain streaming engine: it registers one
 * Custom JSON filter on the single block reader owned by the stream engine.
 */
export class CustomJsonWatcher {
  private readonly parser: CustomJsonParser;
  private readonly createEngine: StreamEngineFactory;

  constructor(parser: CustomJsonParser, createEngine: StreamEngineFactory) {
    this.parser = parser;
    this.createEngine = createEngine;
  }

  /** Parse, validate and normalize one custom_json operation. */
  parse<T = Record<string, unknown>>(
    ...args: Parameters<CustomJsonParser["parseOperation"]>
  ): ReturnType<CustomJsonParser["parseOperation"]> {
    return this.parser.parseOperation<T>(...args) as ReturnType<
      CustomJsonParser["parseOperation"]
    >;
  }

  /**
   * Filtered, normalized Custom JSON event iterator built on the block stream.
   */
  watch<T = Record<string, unknown>>(
    options: CustomJsonStreamOptions,
  ): AsyncGenerator<CustomJsonEvent<T>, void, void> {
    assertNonEmptyString(options.id, "id");
    const { id, actions, onInvalidPayload, ...streamOptions } = options;
    const engine = this.createEngine(streamOptions);

    return iterateEngine<CustomJsonEvent<T>>(
      engine,
      (push) => {
        engine.customJson<T>({
          id,
          ...(actions && actions.length > 0 ? { actions } : {}),
          handler: (event: CustomJsonStreamEvent<T>) => {
            if (event.standardized && event.customJson) {
              push(event.customJson);
              return;
            }
            // A malformed payload must never kill the stream.
            onInvalidPayload?.({
              reason: "payload does not follow the standardized protocol",
              blockNumber: event.blockNumber,
              raw: event.raw,
            });
          },
        });
      },
      options.signal,
    );
  }
}
