import { getCompoundConfig } from "@/lib/registry";
import { resolveDefaultChainId } from "@/lib/config";

/**
 * Resolve the RPC upstream the same-origin proxy (app/api/rome-rpc) forwards
 * to. Precedence:
 *   1. ROME_RPC_UPSTREAM / NEXT_PUBLIC_ROME_RPC override
 *   2. the active chain's canonical RPC from the registry
 * No hardcoded chain — a missing override resolves to whatever the configured
 * default chain's registry entry says, so this stays correct on any chain.
 * Throws (→ 500) only when neither an override nor a registry RPC exists.
 */
export function resolveRomeRpcUpstream(
  env: Record<string, string | undefined>,
  chainId: number = resolveDefaultChainId(),
): string {
  const override = env.ROME_RPC_UPSTREAM || env.NEXT_PUBLIC_ROME_RPC;
  if (override) return override;
  const rpc = getCompoundConfig(chainId)?.rpcUrl;
  if (!rpc) {
    throw new Error(
      `No Rome RPC upstream for chain ${chainId}: set ROME_RPC_UPSTREAM or add the chain's rpcUrl to the registry.`,
    );
  }
  return rpc;
}
