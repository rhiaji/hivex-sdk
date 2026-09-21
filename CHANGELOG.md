# Changelog

All notable changes to `hivexph-sdk` are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## 1.2.0

### Added

- Added `hive.keychain.requestSignIn()` for Hive Keychain account sign-in.
- Added typed `KeychainSignInInput` and `KeychainSignInResult` exports.
- Added a Keychain playground sign-in tab for signing an app challenge message.
- Added `hive.keychainIssuer.token.create()` and `hive.issuer.token.create()` for the Hive Engine
  `tokens.create` action.
- Added a mandatory creation preflight: the signing account must hold at least the sidechain token
  creation fee in BEE, and the token symbol must not already exist. Either failure throws
  (`INSUFFICIENT_BEE`, `TOKEN_ALREADY_EXISTS`) before Keychain opens or a key is resolved.
  Pass `skipChecks: true` to opt out.
- Added `checkCreate()` on both issuers plus the exported `TokenCreationChecker` for read-only
  fee, BEE balance and symbol availability lookups.
- Added `buildCreate()` offline payload previews on `TokenActionBuilder` and both token issuers.
- Added `TokenCreateInput`, `TokenCreateActionInput`, `TokenCreationCheck`, `TokenCreationCheckInput`,
  `EngineTokenRow` and `KeychainTokenCreateInput` exports, the `BEE_SYMBOL` and token limit
  constants, and the new `INSUFFICIENT_BEE` / `TOKEN_ALREADY_EXISTS` error codes.
- Added a token creation panel to the token playground, covering both the Keychain path and the
  server path (server payload preview and server BEE / symbol preflight).
- Added server-side token creation tests for payload parity, validation, preflight enforcement and
  the `skipChecks` opt-out.
- Added `hive.keychainIssuer.nft.create()` and `hive.issuer.nft.create()` for the Hive Engine
  `nft.create` action, following the same flow as token creation. `name` and `symbol` are required;
  `orgName`, `productName`, `maxSupply`, `website`, `authorizedIssuingAccounts` and
  `authorizedIssuingContracts` are optional and omitted from the payload when absent.
- Added the NFT creation preflight: the signing account must hold the NFT creation fee in BEE
  (100 BEE by default, read from `nft.params`) and the NFT symbol must not already exist. Either
  failure throws (`INSUFFICIENT_BEE`, `NFT_ALREADY_EXISTS`) before Keychain opens or a key is
  resolved. Pass `skipChecks: true` to opt out.
- Added `checkCreate()` and `buildCreate()` on both NFT issuers plus the exported
  `NftCreationChecker` for read-only fee, BEE balance and NFT symbol availability lookups.
- Added `NftCreateInput`, `NftCreateActionInput`, `NftCreationCheck`, `NftCreationCheckInput`,
  `EngineNftRow` and `KeychainNftCreateInput` exports, the NFT creation fee and field limit
  constants, and the new `NFT_ALREADY_EXISTS` error code.
- Added an NFT creation panel to the NFT playground, covering the payload preview, the server and
  Keychain preflight checks and Keychain broadcast.
- Added NFT creation tests for payload shape, field validation, preflight failures and the
  `skipChecks` opt-out.

### Changed

- Documented the sign-in, token creation and NFT creation flows in the README, API reference and
  release notes.

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
