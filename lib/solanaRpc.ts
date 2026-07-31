import { resolveDefaultChainId } from "@/lib/config";
import { PUBLIC_DEVNET_RPC } from "@/lib/solana/rpcDefault";
import solanaRpcMap from "@/lib/registry/generated.solana-rpc.json";

export { PUBLIC_DEVNET_RPC };

// SERVER-ONLY module. The per-chain Solana RPC map (generated.solana-rpc.json)
// is read here and ONLY here (via the /api/solana-rpc route) — it must never be
// imported by a client component, or the RPC URLs would land in the client
// bundle (#72). That's why PUBLIC_DEVNET_RPC lives in the leaf lib/solana/
// rpcDefault (which client code imports) rather than being defined here.

/**
 * Resolve the Solana RPC upstream the same-origin proxy (app/api/solana-rpc)
 * forwards to — SERVER-SIDE, so the URL never reaches the client bundle.
 * Precedence:
 *   1. SOLANA_RPC — operator override (may be a private endpoint; deploy config)
 *   2. NEXT_PUBLIC_SOLANA_RPC — legacy dev override
 *   3. the active chain's chain.json#solana.rpc from the registry (#189/#190),
 *      via the server-only generated.solana-rpc.json map — per-chain so a deploy
 *      stays correct on the chain's actual Solana cluster (#72 task 3).
 *   4. PUBLIC_DEVNET_RPC — dev convenience when the chain declares no rpc.
 *
 * `chainId` defaults to the registry default chain (mirrors resolveRomeRpcUpstream).
 */
export function resolveSolanaRpcUpstream(
  env: Record<string, string | undefined>,
  chainId: number = resolveDefaultChainId(),
): string {
  const override = env.SOLANA_RPC || env.NEXT_PUBLIC_SOLANA_RPC;
  if (override) return override;
  return (solanaRpcMap as Record<string, string>)[String(chainId)] || PUBLIC_DEVNET_RPC;
}

// Wire-level scan methods (the "parsed" variants are web3.js client-side sugar
// over these). On an UNINDEXED node any of them is a full account-set sweep
// that keeps running server-side after the client disconnects — stacked sweeps
// are the 2026-07-24 devnet RPC wedge class.
const SCAN_METHODS = new Set([
  "getTokenAccountsByOwner",
  "getTokenAccountsByDelegate",
  "getProgramAccounts",
  "getTokenLargestAccounts",
  "getLargestAccounts",
]);

export function isScanPayload(payload: unknown): boolean {
  const items = Array.isArray(payload) ? payload : [payload];
  return items.some(
    (item) =>
      Boolean(item) &&
      typeof item === "object" &&
      SCAN_METHODS.has((item as { method?: unknown }).method as string),
  );
}

/**
 * Method-aware failover tiers for the /api/solana-rpc proxy.
 *
 * point reads / tx submit: resolveSolanaRpcUpstream (self-hosted) →
 *                          SOLANA_RPC_INDEXED_URL → public
 * scan-class:              SOLANA_RPC_INDEXED_URL → public
 *
 * The self-hosted tier is EXCLUDED for scans by design — see SCAN_METHODS.
 * The public endpoint is indexed too, just rate-limited: an acceptable last
 * resort, never the primary.
 */
export function resolveSolanaRpcTiers(
  env: Record<string, string | undefined>,
  scan: boolean,
  chainId: number = resolveDefaultChainId(),
): string[] {
  const indexed = env.SOLANA_RPC_INDEXED_URL;
  // Last-resort tier. MUST match the deployment's Solana cluster — a devnet
  // fallback on a mainnet deploy would silently answer from the wrong chain.
  // Mainnet deploys set SOLANA_RPC_PUBLIC_URL; devnet/testnet Rome chains
  // settle on Solana devnet, so the default is correct there.
  const publicRpc = env.SOLANA_RPC_PUBLIC_URL || PUBLIC_DEVNET_RPC;
  const chain = scan
    ? [indexed, publicRpc]
    : [resolveSolanaRpcUpstream(env, chainId), indexed, publicRpc];
  return [...new Set(chain.filter((url): url is string => Boolean(url)))];
}
