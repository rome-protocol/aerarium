// Active-chain collateral resolution for the Compound portal.
//
// CRITICAL: collateral lookups MUST be keyed by the runtime active chainId
// (resolved from /api/env), never the build-time-default config
// (DEFAULT_CHAIN_CONFIG_RAW / DEFAULT_CHAIN_ID). On a multi-chain registry the
// build-time default is some other chain (e.g. Aurelius), so reading its
// collateralAssets on the active chain maps the wrong addresses — the UI then renders
// raw 0x… addresses instead of symbols and a collateral supply silently falls
// back to the base asset. markets/page.tsx already resolves via
// getCompoundConfig(activeChainId); this mirrors that for the portal.

import { getCompoundConfig } from "@/lib/registry";
import type { CompoundChainConfig } from "@/lib/registry/types";

/**
 * Full Compound config for the active chain. Falls back to `fallback` only
 * when the active chain has no deployment (keeps callers non-null).
 */
export function activeCompoundConfig(
  chainId: number,
  fallback: CompoundChainConfig,
): CompoundChainConfig {
  return getCompoundConfig(chainId) ?? fallback;
}

export interface AssetMaps {
  decimalsByAsset: Record<string, number>;
  symbolByAsset: Record<string, string>;
}

/**
 * Address-keyed decimals + symbol maps for the active chain's base asset and
 * its collaterals. Addresses are lower-cased so lookups are case-insensitive.
 */
export function buildAssetMaps(
  chainId: number,
  baseAsset: string,
  baseSymbol: string,
  baseDecimals: number,
): AssetMaps {
  const decimalsByAsset: Record<string, number> = {
    [baseAsset.toLowerCase()]: baseDecimals,
  };
  const symbolByAsset: Record<string, string> = {
    [baseAsset.toLowerCase()]: baseSymbol,
  };
  const collateralAssets = getCompoundConfig(chainId)?.collateralAssets ?? {};
  for (const [symbol, info] of Object.entries(collateralAssets)) {
    decimalsByAsset[info.address.toLowerCase()] = info.decimals;
    symbolByAsset[info.address.toLowerCase()] = symbol;
  }
  return { decimalsByAsset, symbolByAsset };
}
