import { defineConfig } from "tsup";

// Resolved against this file so the build works from the repo root or from
// `package-manager/`.
const here = new URL(".", import.meta.url).pathname.replace(/\/$/, "");

/**
 * The package ships one bundled ESM entry plus one bundled declaration file.
 * Bundling keeps every internal folder internal: consumers can only reach what
 * `index.ts` exports, and the emitted JS carries no extensionless relative
 * imports that Node ESM would refuse to resolve.
 */
export default defineConfig({
  entry: { index: `${here}/index.ts` },
  format: ["esm"],
  target: "es2022",
  platform: "neutral",
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  outDir: `${here}/dist`,
  // Runtime dependencies stay external; nothing else is.
  external: ["@noble/hashes", "@noble/secp256k1"],
});
