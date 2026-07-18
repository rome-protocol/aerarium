// Build-time loader that walks the registry checkout and produces the
// CompoundChainConfigMap that the demo bundles in the JS payload.
//
// Called from a Next.js generator (or the build script) so that adding a
// new chain to the registry triggers a rebuild and surfaces the new chain
// in the demo without code changes.
//
// Resolution order for the registry root:
//   1. ROME_REGISTRY_ROOT env var (CI / explicit overrides)
//   2. <next-cwd>/../registry (the monorepo dev layout)
//   3. <next-cwd>/../../registry (worktree layout: .worktrees/<branch>/)
//   4. node_modules/@rome-protocol/registry (when published on NPM)

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { buildCompoundChainConfigMap } from "./loader";
import type { CompoundDeployment, CompoundChainConfig } from "./types";

const CANDIDATES = [
  process.env.ROME_REGISTRY_ROOT,
  path.resolve(process.cwd(), "../registry"),
  path.resolve(process.cwd(), "../../registry"),
  path.resolve(process.cwd(), "node_modules/@rome-protocol/registry"),
].filter(Boolean) as string[];

export function findRegistryRoot(): string {
  for (const root of CANDIDATES) {
    if (existsSync(path.join(root, "apps", "compound"))) return root;
    if (existsSync(path.join(root, "chains"))) return root;
  }
  throw new Error(
    `Could not find a Rome registry checkout. Tried: ${CANDIDATES.join(", ")}. ` +
    `Set ROME_REGISTRY_ROOT or install @rome-protocol/registry.`,
  );
}

interface RegistryInput {
  entry: CompoundDeployment;
  chainJson: Record<string, unknown>;
  contractsJson?: unknown;
  altsJson?: unknown;
}

/** Walk apps/compound + resolve each entry's chain.json / contracts.json / alts.json once. */
function loadRegistryInputs(registryRoot?: string): RegistryInput[] {
  const root = registryRoot ?? findRegistryRoot();
  const appsDir = path.join(root, "apps", "compound");
  if (!existsSync(appsDir)) return [];

  const inputs: RegistryInput[] = [];
  for (const file of readdirSync(appsDir)) {
    if (!/^\d+-[a-z0-9-]+\.json$/.test(file)) continue;
    const entry = JSON.parse(readFileSync(path.join(appsDir, file), "utf8")) as CompoundDeployment;
    const chainDir = path.join(root, "chains", `${entry.chainId}-${entry.chainSlug}`);
    const chainJsonPath = path.join(chainDir, "chain.json");
    if (!existsSync(chainJsonPath)) {
      console.warn(`[registry] no chain.json for ${entry.chainId}-${entry.chainSlug}; skipping`);
      continue;
    }
    const chainJson = JSON.parse(readFileSync(chainJsonPath, "utf8")) as Record<string, unknown>;
    // contracts.json carries the per-chain Multicall3 address; some chains
    // (e.g. Aurelius) have none — that's fine, multicall3 stays undefined.
    const contractsPath = path.join(chainDir, "contracts.json");
    const contractsJson = existsSync(contractsPath)
      ? JSON.parse(readFileSync(contractsPath, "utf8"))
      : undefined;
    // alts.json carries the persistent comet + chain Address Lookup Tables the
    // Solana lane attaches to every DoTxUnsigned v0 tx; absent on chains that
    // haven't published persistent ALTs (persistentAlts then []).
    const altsPath = path.join(chainDir, "alts.json");
    const altsJson = existsSync(altsPath)
      ? JSON.parse(readFileSync(altsPath, "utf8"))
      : undefined;
    inputs.push({ entry, chainJson, contractsJson, altsJson });
  }
  return inputs;
}

export function loadAllCompoundDeployments(registryRoot?: string): Record<number, CompoundChainConfig> {
  return buildCompoundChainConfigMap(loadRegistryInputs(registryRoot));
}

/**
 * Build the SERVER-ONLY per-chain Solana RPC map (chainId → chain.json#solana.rpc).
 * Kept separate from the client config (loadAllCompoundDeployments) so the RPC
 * is emitted to a server-only file the browser bundle never imports (#72). Only
 * chains that declare solana.rpc appear; others fall back at resolve time.
 */
export function loadSolanaRpcMap(registryRoot?: string): Record<number, string> {
  const map: Record<number, string> = {};
  for (const { entry, chainJson } of loadRegistryInputs(registryRoot)) {
    if (entry.status === "retired") continue;
    const solana = chainJson.solana as { rpc?: unknown } | undefined;
    if (typeof solana?.rpc === "string" && solana.rpc.length > 0) {
      map[entry.chainId] = solana.rpc;
    }
  }
  return map;
}
