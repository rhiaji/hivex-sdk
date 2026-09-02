/**
 * Runtime-independent environment access.
 *
 * The SDK never touches `process.env` or `import.meta.env` directly outside of
 * the default resolver below: every runtime (Node, Bun, Workers, Deno, tests,
 * browsers) can inject its own resolver.
 */
export interface EnvironmentResolver {
  get(name: string): string | undefined;
}
