# hivexph-sdk

Reusable TypeScript SDK for Hive Custom JSON operations. Runtime-agnostic (Node, Bun, Deno, Workers, browser), zero runtime dependencies.

```bash
npm install hivexph-sdk
```

## Quick start

```ts
import { HiveClient } from "hivexph-sdk";

const hive = new HiveClient({ endpoint: "https://api.hive.blog" });

// Read a transaction
const tx = await hive.reader.getTransaction("<trx-id>");

// Stream custom_json events
for await (const event of hive.stream.events({ id: "my-app" })) {
  console.log(event.action, event.metadata);
}
```

## Modules

| Namespace | Purpose |
| --- | --- |
| `hive.rpc` | JSON-RPC client with configurable endpoint |
| `hive.beacon` | Healthy node discovery (PeakD Beacon) |
| `hive.builder` | `{ action, metadata }` custom_json construction |
| `hive.keychain` | Browser signing via Hive Keychain, incl. `keychain.issuer` |
| `hive.configs` | Named configurations + account aliases (env-driven) |
| `hive.signer` | Pluggable signing strategies |
| `hive.issuer` | Backend token / NFT issuance (signs + broadcasts) |
| `hive.stream` | Block and event streaming |
| `hive.reader` | Transaction lookup and normalization |

## Backend vs. browser

Backend issuers resolve an account alias, resolve the signing key lazily from the
environment, sign and broadcast. There is no execution-mode switch:

```ts
await hive.issuer.token.mint({ from: hive.accounts.treasury, symbol: "TOKEN", account: "alice", quantity: "10.000" });

// Offline, key-free payload preview
const preview = hive.issuer.token.buildMint({ from: hive.accounts.treasury, symbol: "TOKEN", account: "alice", quantity: "10.000" });
```

Browsers use the separate Keychain API — no configuration, alias or private key:

```ts
await hive.keychain.issuer.token.transfer({ username: "alice", symbol: "TOKEN", account: "bob", quantity: "1.000" });
```

## Custom RPC nodes

```ts
const hive = new HiveClient({ endpoint: "https://my-own-node.example" });
hive.rpc.setEndpoint("https://api.deathwing.me");
const nodes = await hive.beacon.topNodes(10);
```

## Development

```bash
npm run typecheck   # standalone typecheck
npm run test        # unit tests
npm run build       # emit dist/ (JS + .d.ts)
```
