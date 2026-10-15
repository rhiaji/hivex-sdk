import { writeFileSync } from "node:fs";
import { HiveClient } from "hivexph-sdk";
import { checkPublicTransfer, nativeFixtures, engineFixture } from "../test-support/native-signing.mjs";

// Uses the real package exports and Node ESM loader, with all RPC intercepted.
const captures = [];
for (const fixture of [...nativeFixtures, engineFixture]) {
  captures.push(await checkPublicTransfer(HiveClient, fixture));
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(captures, null, 2));
console.log(`Built public API: ${captures.length} transfers independently verified; no network calls.`);
