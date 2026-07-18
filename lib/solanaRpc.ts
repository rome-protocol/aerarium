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
