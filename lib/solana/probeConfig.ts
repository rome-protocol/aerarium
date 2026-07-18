import { getCompoundConfig } from "@/lib/registry";
import { resolveDefaultChainId } from "@/lib/config";
import { PUBLIC_DEVNET_RPC } from "@/lib/solana/rpcDefault";

export interface ProbeConfig {
  /** Discovery RPC (rome_emulateCallAccounts, the Rome proxy #353). */
  proxyUrl: string;
  /**
   * Where the DoTxUnsigned is submitted. Defaults to the same-origin
   * "/api/solana-rpc" proxy path (relative) so the private SOLANA_RPC stays
   * server-side; resolve to an absolute endpoint with solanaRpcEndpoint() before
   * handing to web3.js Connection. An absolute NEXT_PUBLIC_SOLANA_RPC override
   * (dev direct-to-RPC) is used as-is.
   */
  solanaRpc: string;
  /** Rome EVM program id (the the Rome EVM program program) this chain runs on. */
  programId: string;
  chainId: number;
  /** Base-asset Comet (supply/withdraw target). */
  comet: string;
  /** Base asset wrapper (wUSDC). */
  baseAsset: string;
  /** Per-chain Multicall3 (registry contracts.json live version); undefined if the chain has none. */
  multicall3?: `0x${string}`;
  /** Solana cluster for explorer links + RPC defaulting (registry chain.json#solana.cluster). */
  solanaCluster: string;
  /**
   * Persistent Address Lookup Tables (base58 pubkeys) the lane attaches to every
   * DoTxUnsigned v0 tx — the registry comet + chain ALTs (CompoundChainConfig
   * #persistentAlts). Replaces the per-user ALT. [] on chains with no alts.json.
   */
  persistentAlts: string[];
}

// Infra-endpoint defaults — NOT chain identity, just where the browser
// submits / discovers. Both default to same-origin proxy routes so the private
// upstreams (SOLANA_RPC, DISCOVERY_PROXY_UPSTREAM) never reach the client
// bundle or the browser's network tab (#72) — one image runs against any env by
// swapping deploy-time .env, with the upstreams resolved server-side.
//
// proxyUrl defaults to the same-origin "/api/discovery" route, which forwards
// server-side to DISCOVERY_PROXY_UPSTREAM. Never bake an http://localhost URL
// into the client default: Next.js inlines NEXT_PUBLIC_* + module constants at
// build time, and scripts/check-bundle-no-localhost.sh fails the build if a
// localhost URL reaches a client chunk. NEXT_PUBLIC_DISCOVERY_PROXY_URL still
// overrides for local dev.
//
// solanaRpc defaults to the same-origin "/api/solana-rpc" route, which forwards
// the DoTxUnsigned (getLatestBlockhash → sendRawTransaction → getSignatureStatuses,
// all HTTP JSON-RPC — no WebSocket) server-side to the private SOLANA_RPC. web3.js
// Connection needs an absolute URL, so consumers resolve this relative path
// against the browser origin via solanaRpcEndpoint(). NEXT_PUBLIC_SOLANA_RPC
// still overrides with an absolute URL for local dev (direct-to-RPC).
const SOLANA_RPC_PROXY_DEFAULT = "/api/solana-rpc";
const DISCOVERY_PROXY_DEFAULT = "/api/discovery";

function pick(v: string | undefined, fallback: string): string {
  return v && v.length > 0 ? v : fallback;
}

/**
 * Resolve ProbeConfig.solanaRpc into an absolute endpoint for web3.js
 * `new Connection()` / the ConnectionProvider. The default is a same-origin
 * relative proxy path (/api/solana-rpc); prefix it with the browser origin. An
 * absolute http(s) override (NEXT_PUBLIC_SOLANA_RPC, dev direct-to-RPC) passes
 * through untouched. Pure — origin is passed in (window.location.origin in the
 * browser, "" during SSR).
 *
 * During SSR / static prerender there is no origin (""), but web3.js Connection
 * rejects a relative URL at construction — so fall back to an absolute public
 * endpoint. The connection is never used to submit server-side (no wallet); the
 * client re-resolves to the same-origin proxy on hydration.
 */
export function solanaRpcEndpoint(solanaRpc: string, origin: string): string {
  if (/^https?:\/\//.test(solanaRpc)) return solanaRpc;
  if (!origin) return PUBLIC_DEVNET_RPC;
  return `${origin}${solanaRpc}`;
}

/**
 * Resolve the Solana-native lane's runtime config. Chain identity (program id,
 * chainId, comet, base asset, multicall3, cluster) comes from the registry
 * config for the selected chain — never a hardcoded chain. NEXT_PUBLIC_* env
 * vars are explicit per-field overrides.
 *
 * Chain-id precedence:
 *   1. NEXT_PUBLIC_ROME_CHAIN_ID — explicit build-time pin (back-compat)
 *   2. runtimeChainId — the /api/env defaultChainId (useEnv), so one image
 *      picks its chain at deploy time without a rebuild
 *   3. resolveDefaultChainId() — the registry default
 */
export function resolveProbeConfig(
  env: Record<string, string | undefined>,
  runtimeChainId?: number | null,
): ProbeConfig {
  const chainId = env.NEXT_PUBLIC_ROME_CHAIN_ID
    ? Number(env.NEXT_PUBLIC_ROME_CHAIN_ID)
    : runtimeChainId ?? resolveDefaultChainId();
  const cfg = getCompoundConfig(chainId);
  const cometFromCfg = cfg?.comets[cfg.primaryComet]?.address;
  return {
    chainId,
    programId: pick(env.NEXT_PUBLIC_ROME_EVM_PROGRAM, cfg?.romeEvmProgramId ?? ""),
    comet: pick(env.NEXT_PUBLIC_COMET_PROXY, cometFromCfg ?? ""),
    baseAsset: pick(env.NEXT_PUBLIC_UNIFIED_TOKEN, cfg?.baseAsset.address ?? ""),
    multicall3: cfg?.multicall3,
    persistentAlts: cfg?.persistentAlts ?? [],
    solanaCluster: pick(env.NEXT_PUBLIC_SOLANA_CLUSTER, cfg?.solanaCluster ?? "devnet"),
    solanaRpc: pick(env.NEXT_PUBLIC_SOLANA_RPC, SOLANA_RPC_PROXY_DEFAULT),
    proxyUrl: pick(env.NEXT_PUBLIC_DISCOVERY_PROXY_URL, DISCOVERY_PROXY_DEFAULT),
  };
}
