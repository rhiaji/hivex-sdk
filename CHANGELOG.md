# Changelog

All notable changes to `hivexph-sdk` are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## 1.0.0

First stable release. The public API is now frozen under semver.

### Public API

Everything is reachable from the single entry point `hivexph-sdk`. There are no
deep import paths and no secondary entry points.

```
hive = new HiveClient(options)
 ├── configs         named configurations, account aliases, env references
 ├── accounts        key-free account references
 ├── rpc             blockchain communication
 ├── blocks.watch()  the single canonical block stream
 ├── reader          transaction reading + the unified stream engine
 ├── customJson      build / broadcast / watch standardized payloads
 ├── payments        native + Layer 2 payments with triggers
 ├── issuer          backend token + NFT operations
 ├── keychain        browser transactions through Hive Keychain
 └── keychainIssuer  browser token + NFT operations through Hive Keychain
```

### Architecture

- **One canonical block engine.** `blocks.watch()`, `customJson.watch()`,
  `payments.watch()` and `reader.stream()` are filtered views over a single
  polling loop — no duplicate polling and no block skipping.
- **One transaction reader.** Payment parsing, Custom JSON parsing and Layer 2
  verification all reuse the same normalized operation model.
- **One write path per environment.** Backend issuance goes through
  `hive.issuer`, browser issuance through `hive.keychainIssuer`; both emit
  byte-identical contract actions from shared builders and validators.

### Removed (pre-1.0 cleanup)

- The `Signer` system, executors and dry-run mode. Signing is internal and
  private keys are never exposed on the public surface.
- Legacy stream implementations, duplicate protocol builders and the legacy
  NFT transaction builder.
- All compatibility layers, re-export shims and import shims.
- `mint` naming: token and NFT issuance is now `issue`.

### Packaging

- ESM build with generated type declarations (`dist/index.js`, `dist/index.d.ts`).
- Zero runtime Node built-ins and no DOM access at module scope: works in Node
  18+, browsers, Bun, Deno and edge/Worker runtimes.
