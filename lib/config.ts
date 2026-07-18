// Aerarium runtime config.  Reads everything from the Rome registry at build
// time — adding a new chain or rewiring an existing one is a registry JSON
// edit, not a code change here.  Schema source-of-truth:
// registry/schema/appsCompound.schema.json
//
// Default chain comes from NEXT_PUBLIC_DEFAULT_CHAIN_ID (when set) or falls
// back to the first chain in the registry's apps/compound/ that has the
// matching `network` per env classification.
//
// For Vercel-style deploys: set NEXT_PUBLIC_DEFAULT_CHAIN_ID + ensure the
// registry is checked out alongside (handled by next build via the
// monorepo layout) OR install @rome-protocol/registry as a github: dep
// once v0.11.0 publishes on NPM.

import { getCompoundConfig, listCompoundChains } from "./registry";
import type { CompoundChainConfig } from "./registry/types";

const ENV_DEFAULT_CHAIN_ID = process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID
  ? Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID)
  : undefined;

export interface ResolveDefaultChainIdInput {
  /** Runtime override from /api/env via EnvProvider. Wins when non-null. */
  runtimeChainId?: number | null;
}

/**
 * Resolve which chain the demo defaults to.  Priority:
 *   1. runtimeChainId argument (from /api/env via EnvProvider) — wins over everything
 *   2. NEXT_PUBLIC_DEFAULT_CHAIN_ID build-time env (back-compat)
 *   3. A LIVE registry chain — NEVER a retired `real-testnet` substrate chain
 *      (prefer `testnet`, else any non-`real-testnet`). Dev/no-env safety net
 *      only; real deploys pin the exact chain via priority 1 or 2.
 */
export function resolveDefaultChainId(input?: ResolveDefaultChainIdInput): number {
  if (input?.runtimeChainId != null) return input.runtimeChainId;
  if (ENV_DEFAULT_CHAIN_ID) return ENV_DEFAULT_CHAIN_ID;
  const all = listCompoundChains();
  if (all.length === 0) {
    throw new Error(
      "No Compound deployments found in the Rome registry. " +
        "Add an apps/compound/<chainId>-<slug>.json entry and rebuild.",
    );
  }
  // Never default to a retired real-testnet substrate chain (e.g. Aurelius
  // 30001 — nothing is deployed there). A real deploy pins the exact chain via
  // runtimeChainId (priority 1) or NEXT_PUBLIC_DEFAULT_CHAIN_ID (priority 2);
  // this is only the dev/no-env safety net, so prefer any LIVE chain.
  const live = all.filter((c) => c.network !== "real-testnet");
  const pool = live.length > 0 ? live : all;
  const testnet = pool.find((c) => c.network === "testnet");
  return (testnet ?? pool[0]).chainId;
}

const DEFAULT_CHAIN_ID = resolveDefaultChainId();
const DEFAULT_CONFIG = getCompoundConfig(DEFAULT_CHAIN_ID);

if (!DEFAULT_CONFIG) {
  throw new Error(
    `Default chainId=${DEFAULT_CHAIN_ID} has no Compound deployment in registry. ` +
    `Either set NEXT_PUBLIC_DEFAULT_CHAIN_ID to a chain with a deployment, or add ` +
    `apps/compound/${DEFAULT_CHAIN_ID}-<slug>.json to the registry.`,
  );
}

/**
 * Build the legacy DEFAULT_CHAIN_CONFIG shape from the resolved CompoundChainConfig.
 * Maintains the surface CompoundPanel / wagmi.ts already consume; the inner
 * values are now sourced from the registry.
 *
 * Browser fetches go through the same-origin /api/rome-rpc proxy regardless
 * of which chain is active — the chain's nginx blocks CORS, and the proxy
 * route handler is environment-agnostic.
 */
function buildLegacyConfig(cfg: CompoundChainConfig) {
  const rome_rpc_server = process.env.ROME_RPC_UPSTREAM ?? cfg.rpcUrl;
  const rome_rpc_browser = "/api/rome-rpc";
  return {
    rome: {
      chainId: cfg.chainId,
      rpc: typeof window === "undefined" ? rome_rpc_server : rome_rpc_browser,
      rpcUpstream: cfg.rpcUrl,
      /** Block-explorer base (rome-via) for tx/address links. Distinct from
       *  `rpc` — never build explorer links off the RPC URL. */
      explorerUrl: cfg.explorerUrl,
      programId: process.env.NEXT_PUBLIC_ROME_EVM_PROGRAM ?? "",
      /** Base asset (wUSDC wrapper). Standard IERC20 — approve + transferFrom, no faucet. */
      unifiedToken: cfg.baseAsset.address,
      /** Display symbol for the base asset (e.g., "wUSDC"). Sourced from registry. */
      baseSymbol: cfg.baseAsset.displaySymbol,
      /** Primary Comet for the demo UI (supply/withdraw flows). */
      cometProxy: cfg.comets[cfg.primaryComet].address,
      /** Collateral-aware Comet — used for borrow + transferAsset. Match the
       * preference order in lib/flows/leverage-open.ts:pickCollatComet so the
       * portal displays state from the SAME Comet the leverage flow targets. */
      cometProxyCollateral: (cfg.comets["multicollat"]?.address
        ?? cfg.comets["collat-pcol"]?.address
        ?? cfg.comets[cfg.primaryComet].address) as `0x${string}`,
      pcolCollateral: (cfg.collateralAssets.PCOL?.address
        ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`)),
      goldCollateral: (cfg.collateralAssets.GOLD?.address
        ?? cfg.collateralAssets.MOCK?.address
        ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`)),
      bulker: cfg.bulker,
      name: cfg.displayName,
      /** Rome network tier (testnet / devnet / mainnet). Surfaced in footer trust line. */
      network: cfg.network,
      /** Registry-declared UX capability flags. */
      ux: cfg.ux,
      /** Jito bundle path enabled on this chain? Aerarium uses N-tx sequential when false. */
      jitoEnabled: cfg.jitoEnabled,
      /** Per-chain Multicall3 from the registry; viem batches reads through it. */
      multicall3: cfg.multicall3,
    },
  } as const;
}

export const DEFAULT_CHAIN_CONFIG = buildLegacyConfig(DEFAULT_CONFIG);

/**
 * The raw registry-loaded CompoundChainConfig for the default chain.  Use
 * this when the legacy DEFAULT_CHAIN_CONFIG shape is insufficient — e.g. flow
 * libraries that need the full per-Comet collateralAssets[] mapping.
 */
export const DEFAULT_CHAIN_CONFIG_RAW = DEFAULT_CONFIG;

/**
 * For chain-switching support (Phase 3b): given a chainId from the user's
 * wallet, return the corresponding demo config.  Returns undefined when
 * Compound is not deployed on that chain.
 */
export function configForChain(chainId: number) {
  const cfg = getCompoundConfig(chainId);
  return cfg ? buildLegacyConfig(cfg) : undefined;
}
