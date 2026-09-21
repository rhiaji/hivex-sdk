# hivexph-sdk

Reusable TypeScript SDK for Hive Custom JSON operations, payments and blockchain streaming.
Runtime-agnostic (Node >= 18, Bun, Deno, Workers, browser), no React and no DOM APIs.

**Package shape**

| Field            | Value                                                        |
| ---------------- | ------------------------------------------------------------ |
| Entry point      | `hivexph-sdk` — the only import path; there are no deep paths |
| Module format    | ESM only (`"type": "module"`)                                 |
| Types            | Bundled `dist/index.d.ts`                                     |
| Side effects     | None — importing opens no connection and starts no stream     |
| Runtime deps     | `@noble/secp256k1`, `@noble/hashes` (backend signing only)    |

```bash
npm install hivexph-sdk
```

## Standalone repository

This folder is self-contained: copy it out, push it to its own GitHub repo, and
it builds, tests and publishes with plain npm — no bun, no workspace, no parent
config.

```bash
npm install       # installs tsup, typescript, vitest
npm run typecheck
npm test
npm run build     # emits dist/index.js + dist/index.d.ts
npm publish       # runs the build via prepack
```

## Quick start

```ts
import { HiveClient } from "hivexph-sdk";

const hive = new HiveClient({
  endpoint: "https://api.hive.blog", // optional; Beacon discovery otherwise
  accounts: {
    treasury: { accountEnv: "TREASURY_ACCOUNT", keyEnv: "TREASURY_ACTIVE_KEY" },
  },
});

// Read one transaction
const tx = await hive.reader.transaction({
  transactionId: "7b064a84a968caddd2496f3270f0cecafb954217",
});

// Watch standardized custom_json events
for await (const event of hive.customJson.watch({ id: "my-app" })) {
  console.log(event.account, event.action, event.metadata);
}
```

## Namespaces

| Namespace          | Purpose                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `hive.configs`     | Your configuration object, frozen and typed (aliases via `hive.accounts`) |
| `hive.rpc`         | Hive RPC calls, endpoint override and automatic fallback                  |
| `hive.beacon`      | Healthy node discovery (PeakD Beacon)                                     |
| `hive.builder`     | `custom_json` payload / operation construction                            |
| `hive.parser`      | Safe `custom_json` parsing + protocol validation                          |
| `hive.keychain`    | Browser sign-in and signing via Hive Keychain (`keychain.payments`) |
| `hive.issuer`      | Backend Hive Engine token / NFT operations (signs + broadcasts)           |
| `hive.payments`    | Native HIVE/HBD + Layer 2 payments, validation and watching              |
| `hive.blocks`      | The core block stream (`hive.blocks.watch()`)                            |
| `hive.customJson`  | `parse()` and `watch()` over the core block stream                        |
| `hive.reader`      | Transaction reader + unified multi-filter stream engine                  |

**One streaming engine.** `hive.blocks.watch()`, `hive.customJson.watch()`,
`hive.payments.watch()` and `hive.reader.stream()` all consume the same block reader — no namespace
opens its own polling loop. The engine owns head tracking, sequential ordering, historical
backfill, the gapless history-to-live transition, retries and `AbortSignal` cancellation.

Blocks are normalized once, so every consumer sees the same shape regardless of how a node
represents operations:

```ts
for await (const block of hive.blocks.watch({ fromBlock: 90_000_000 })) {
  for (const tx of block.transactions) {
    for (const op of tx.operations) {
      console.log(block.blockNumber, tx.transactionId, op.operationIndex, op.operationType);
    }
  }
}
```

## The standardized payload

Every transport (`custom_json`, native transfer memos, Hive Engine memos) carries the same shape:

```json
{ "action": "purchase_item", "metadata": { "itemId": "sword_01" } }
```

`action` is a required non-empty string, `metadata` is always present after normalization (possibly
`null`), and there are no payload timestamps — block time is the authoritative clock.

```ts
import { HiveClient, isActionPayload, validateActionPayload } from "hivexph-sdk";

const hive = new HiveClient();
const payload = hive.builder.buildPayload({ action: "purchase_item", metadata: { id: 1 } });
const json = hive.builder.serialize(payload);
isActionPayload(JSON.parse(json)); // true
validateActionPayload(JSON.parse(json)); // { valid: true }
```

## Configuration

Configurations hold account aliases and metadata. They never carry RPC endpoints and never hold
resolved private keys — `keyEnv` is read lazily, only when a backend signing operation needs it.

| Field        | Meaning                                                   |
| ------------ | --------------------------------------------------------- |
| `account`    | Direct Hive account name                                   |
| `accountEnv` | Env var holding the account name                           |
| `key`        | Direct private key — backend only                          |
| `keyEnv`     | Env var holding the private key (preferred, backend only)   |
| `options`    | Arbitrary developer data, preserved verbatim               |

```ts
const hive = new HiveClient({
  accounts: { treasury: { accountEnv: "TREASURY_ACCOUNT", keyEnv: "TREASURY_ACTIVE_KEY" } },
  applicationId: "my-app", // default custom_json id
  tests: { accounts: { minter: "test-minter" } }, // your own structure
});

hive.accounts.treasury; // key-free AccountReference, passed to operations
hive.configs.tests.accounts.minter; // "test-minter", fully typed
```

## Backend vs. browser

Backend issuers resolve an alias, resolve the signing key lazily from the environment, sign and
broadcast. Quantities are always decimal strings.

```ts
await hive.issuer.token.issue({
  from: hive.accounts.treasury,
  symbol: "MYTOKEN",
  account: "alice",
  quantity: "10.000",
});

// Offline, key-free payload preview
const preview = hive.issuer.token.buildIssue({ from: hive.accounts.treasury, symbol: "MYTOKEN", account: "alice", quantity: "10.000" });
preview.alias; // "treasury"
preview.id; // resolved application id
preview.json; // serialized contract action
preview.operation; // ["custom_json", { ... }]
```

Browsers use the Keychain API — no configuration, alias or private key:

```ts
if (!hive.keychain.isAvailable()) throw new Error("Install Hive Keychain");

const signIn = await hive.keychain.requestSignIn({
  username: "alice",
  message: "Sign in to my-app: nonce-123456",
});
// Verify signIn.signature server-side to prove account ownership.

await hive.keychainIssuer.token.transfer({
  username: "alice",
  symbol: "MYTOKEN",
  account: "bob",
  quantity: "1.000",
});

// Creating a token. Required: name, symbol, precision, maxSupply. Optional: url.
// Checks the BEE balance against the creation fee and that the symbol is still
// free, then throws before Keychain opens if either fails.
await hive.keychainIssuer.token.create({
  username: "alice",
  symbol: "MYTOKEN",
  name: "My Token",
  precision: 3,
  maxSupply: "1000000",
});

// Creating an NFT collection follows the same flow (100 BEE fee, BEE balance and
// symbol checks). Required: name, symbol. Everything else is optional and can be
// updated later in TribalDex.
await hive.keychainIssuer.nft.create({
  username: "alice",
  name: "My Collection",
  symbol: "MYNFT",
  orgName: "My Org", // optional
  productName: "My Product", // optional
  maxSupply: "1000", // optional, unlimited when omitted
  website: "https://example.com", // optional
});

// Read-only preflight, or an offline payload preview:
const check = await hive.keychainIssuer.nft.checkCreate({ username: "alice", symbol: "MYNFT" });
const payload = hive.keychainIssuer.nft.buildCreate({ name: "My Collection", symbol: "MYNFT" });
```

Server-side (alias + key) creation uses the same checks:

```ts
await hive.issuer.token.create({
  from: hive.accounts.treasury,
  symbol: "MYTOKEN",
  name: "My Token",
  precision: 3,
  maxSupply: "1000000",
});

await hive.issuer.nft.create({
  from: hive.accounts.nftIssuer,
  name: "My Collection",
  symbol: "MYNFT",
});
```

For both paths, creation throws `INSUFFICIENT_BEE` when the signing account cannot cover the
sidechain fee, and `TOKEN_ALREADY_EXISTS` / `NFT_ALREADY_EXISTS` when the symbol is already taken.
Pass `skipChecks: true` to broadcast without the preflight.

## Payments

```ts
await hive.payments.hive.transfer({
  from: hive.accounts.treasury,
  account: "bob",
  amount: "10.000",
  symbol: "HIVE",
  action: "purchase_item",
  metadata: { itemId: "sword_01" },
});

const result = await hive.payments.validate({
  transactionId, // the network is detected automatically
  expected: { account: "bob", symbol: "HIVE", quantity: "10.000", action: "purchase_item" },
});
// result.status: "pending" | "success" | "failed" | "invalid" | "not_found"
```

Broadcasting a Layer 2 transfer only proves the `custom_json` reached Hive. Execution success is a
separate sidechain check — always validate before crediting anything.

## Parsing operations

```ts
const result = hive.customJson.parse(
  operation,
  { blockNumber, blockTimestamp, transactionId, transactionIndex, operationIndex },
  { id: "my-app" }, // optional filter: { id, actions }
);

if (result.status === "ok") result.event.action;
else if (result.status === "invalid") console.warn(result.reason);
// "not_custom_json" -> different id, filtered action, or not a custom_json operation
```

## Errors

All error classes extend `HiveSdkError` and carry a stable `code`:

```ts
import { HiveSdkError } from "hivexph-sdk";

try {
  await hive.issuer.token.transfer({ /* ... */ });
} catch (error) {
  if (error instanceof HiveSdkError) console.error(error.code, error.message);
}
```

Named subclasses: `HiveConfigurationError`, `HiveAccountNotFoundError`,
`HiveAccountResolutionError`, `HiveEnvironmentVariableMissingError`, `HiveSigningKeyMissingError`,
`HiveSigningError`, plus the NFT-specific errors in `issuer/nft/errors`. Messages name the missing
environment variable, never its value.

## Custom RPC nodes

```ts
const hive = new HiveClient({ endpoint: "https://my-own-node.example" });
hive.rpc.resetEndpoint();
const nodes = await hive.beacon.getHealthyNodes();
```

## Security rules

- Private keys never live in frontend code or in committed configuration — use `keyEnv`.
- Keys are resolved lazily at signing time and never cached.
- Account references passed around the API are key-free.
- Config summaries and logs never contain secrets.

## Development

```bash
npm run typecheck   # standalone typecheck
npm run test        # unit tests
npm run build       # emit dist/ (JS + .d.ts)
```

MIT licensed.
