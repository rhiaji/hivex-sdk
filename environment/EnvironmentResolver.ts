import { HiveEnvironmentVariableMissingError } from "../errors/index";
import type { EnvironmentResolver } from "./types";

export type { EnvironmentResolver };

/**
 * Default resolver. Safe in browsers and edge runtimes: `process` is probed
 * lazily inside `get()` and never dereferenced at module initialization.
 */
export const defaultEnvironmentResolver: EnvironmentResolver = {
  get(name: string): string | undefined {
    const env = readRuntimeEnv();
    if (!env) return undefined;
    const value = env[name];
    return typeof value === "string" ? value : undefined;
  },
};

function readRuntimeEnv(): Record<string, string | undefined> | undefined {
  const candidate = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;
  if (candidate && typeof candidate === "object" && candidate.env) return candidate.env;
  return undefined;
}

/** Create a resolver over a plain object (tests, custom runtimes). */
export function createEnvironmentResolver(
  values: Record<string, string | undefined>,
): EnvironmentResolver {
  return { get: (name) => values[name] };
}

/** A value is considered present only when it is a non-whitespace string. */
export function isPresentEnvValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Read a required environment variable. Empty / whitespace-only values are
 * treated as missing. The value itself is never included in errors.
 */
export function requireEnvValue(
  environment: EnvironmentResolver,
  name: string,
  context: { alias?: string; config?: string; purpose?: "account" | "key" } = {},
): string {
  const value = environment.get(name);
  if (!isPresentEnvValue(value)) {
    throw new HiveEnvironmentVariableMissingError(name, context);
  }
  return value;
}
