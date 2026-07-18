// Prebuild script: walks the Rome registry and emits a static JSON object
// of chainId → CompoundChainConfig.  Runs before `next build`; output goes
// to lib/registry/generated.json which the demo imports at runtime.
//
// Adding a new chain to the registry → rebuild picks it up automatically.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadAllCompoundDeployments, loadSolanaRpcMap } from "../lib/registry/build-time-load";

const outDir = path.resolve(__dirname, "..", "lib", "registry");
const outFile = path.join(outDir, "generated.json");
// Server-only per-chain Solana RPC map. Emitted separately from generated.json
// because it must NOT reach the client bundle (#72) — read only by the
// /api/solana-rpc route via lib/solanaRpc.ts.
const solanaRpcOutFile = path.join(outDir, "generated.solana-rpc.json");

function main() {
  const checkOnly = process.argv.includes("--check");

  let map: ReturnType<typeof loadAllCompoundDeployments>;
  try {
    map = loadAllCompoundDeployments();
  } catch (e) {
    // Registry not checked out alongside (CI runner, npm install consumer
    // without monorepo).  When --check is set this is a hard error;
    // otherwise it's a soft "skip" with a warning so consumers can still
    // build using the committed generated.json.
    if (checkOnly) throw e;
    console.warn(
      "[build-compound-config] Could not find Rome registry checkout; " +
      "leaving committed lib/registry/generated.json as-is. " +
      "Set ROME_REGISTRY_ROOT to regenerate.",
    );
    return;
  }
  const chains = Object.values(map);
  if (chains.length === 0) {
    console.warn(
      "[build-compound-config] No apps/compound entries found in the Rome registry. " +
      "The demo will throw at startup unless committed generated.json has entries.",
    );
  } else {
    console.log(`[build-compound-config] Loaded ${chains.length} Compound deployment(s):`);
    for (const c of chains) {
      console.log(`  ${c.chainId}-${c.chainSlug}  base=${c.baseAsset.address}  comets=${Object.keys(c.comets).length}  jito=${c.jitoEnabled ? "on" : "off"}`);
    }
  }

  // BigInt replacer — faucet gasDropWei / dropAmountWei are bigints and
  // JSON.stringify can't serialize them natively.
  const nextContent = JSON.stringify(
    map,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
  const solanaRpcMap = loadSolanaRpcMap();
  const solanaRpcContent = JSON.stringify(solanaRpcMap, null, 2);
  const rpcChains = Object.keys(solanaRpcMap);
  if (rpcChains.length) {
    console.log(`[build-compound-config] server-only Solana RPC map: ${rpcChains.join(", ")}`);
  }

  if (checkOnly) {
    // Drift detection: regenerate from registry, fail if either committed file
    // is out of sync.  Run in CI to catch out-of-band registry changes.
    checkInSync(outFile, nextContent, "generated.json");
    checkInSync(solanaRpcOutFile, solanaRpcContent, "generated.solana-rpc.json");
    console.log("[build-compound-config --check] generated.json + generated.solana-rpc.json are in sync with registry");
    return;
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, nextContent);
  console.log(`[build-compound-config] wrote ${outFile}`);
  writeFileSync(solanaRpcOutFile, solanaRpcContent);
  console.log(`[build-compound-config] wrote ${solanaRpcOutFile}`);
}

function checkInSync(file: string, nextContent: string, label: string) {
  if (!existsSync(file)) {
    console.error(`[build-compound-config --check] ${file} does not exist`);
    process.exit(1);
  }
  if (readFileSync(file, "utf8").trimEnd() !== nextContent.trimEnd()) {
    console.error(
      `[build-compound-config --check] DRIFT: committed ${label} differs from registry. ` +
      `Regenerate with 'npm run build:registry-config' and re-commit.`,
    );
    process.exit(1);
  }
}

main();
