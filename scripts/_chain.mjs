// Shared chain-config resolver for the dev probe scripts. Reads the committed
// registry projection (lib/registry/generated.json) so no probe hardcodes a
// chain id, contract address, program, or RPC. Select the chain with the
// CHAIN_ID env var (or NEXT_PUBLIC_DEFAULT_CHAIN_ID); see docs/INTEGRATION.md.
//
//   CHAIN_ID=<chainId> node scripts/<probe>.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const GENERATED = fileURLToPath(
  new URL("../lib/registry/generated.json", import.meta.url),
);
const CHAINS = JSON.parse(readFileSync(GENERATED, "utf8"));

const solanaRpcFor = (cfg) =>
  cfg.solanaRpc || `https://api.${cfg.solanaCluster}.solana.com`;

// Resolve a chain's probe config from generated.json. Pure (config only) so it
// reproduces exactly what the scripts used to hardcode, independent of env.
export function resolveChain(chainId) {
  const cfg = CHAINS[String(chainId)];
  if (!cfg) {
    throw new Error(
      `chain ${chainId} not in generated.json (have: ${Object.keys(CHAINS).join(", ")})`,
    );
  }
  const ASSET_ADDR = {
    [cfg.baseAsset.displaySymbol]: cfg.baseAsset.address,
    ...Object.fromEntries(
      Object.values(cfg.collateralAssets ?? {}).map((c) => [c.symbol, c.address]),
    ),
  };
  return {
    CHAIN_ID: Number(cfg.chainId),
    EVM: cfg.rpcUrl,
    SOLANA: solanaRpcFor(cfg),
    COMET: cfg.comets?.[cfg.primaryComet]?.address,
    BASE: cfg.baseAsset.address,
    BASE_SYMBOL: cfg.baseAsset.displaySymbol,
    PROGRAM: cfg.romeEvmProgramId,
    MULTICALL3: cfg.multicall3,
    CLUSTER: cfg.solanaCluster,
    ASSET_ADDR,
    cfg,
  };
}

// Env-bound entry: pick the chain from CHAIN_ID / NEXT_PUBLIC_DEFAULT_CHAIN_ID,
// then apply the optional ROME_RPC / SOLANA_RPC endpoint overrides. Throws a
// helpful message (listing the available chains) if no chain is selected.
export function loadChain() {
  const id = process.env.CHAIN_ID || process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID;
  if (!id) {
    throw new Error(`set CHAIN_ID (one of: ${Object.keys(CHAINS).join(", ")})`);
  }
  const c = resolveChain(id);
  return {
    ...c,
    EVM: process.env.ROME_RPC || c.EVM,
    SOLANA: process.env.SOLANA_RPC || c.SOLANA,
  };
}
