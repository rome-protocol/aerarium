// Derive the dev-tooling probe/supply asset list (base + every collateral)
// straight from the active chain's registry config — so the discovery + flows
// harnesses (and any new app's harness) are chain-agnostic: point
// NEXT_PUBLIC_DEFAULT_CHAIN_ID at a chain, and the asset list follows from its
// apps/compound/<chain>.json. No hardcoded addresses.

import type { CompoundChainConfig } from "./registry/types";

export interface DiscoveryAsset {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  /** A small test supply/probe amount in the asset's base units. */
  amount: bigint;
}

export interface DiscoveryAssetsOptions {
  /** Whole tokens of each asset the harness supplies/probes (default 1). */
  tokensPerAsset?: number;
  /** Base-asset decimals. The registry's baseAsset shape carries no decimals
   *  (it's the unit of account); default to the wUSDC-convention 6dp, override
   *  per chain if the base differs. Collateral decimals come from the config. */
  baseDecimals?: number;
}

/**
 * Build the asset list (base first, then collaterals in config order) from a
 * CompoundChainConfig. `amount` is `tokensPerAsset` whole tokens scaled by each
 * asset's decimals — a test-only quantity, not chain identity.
 */
export function discoveryAssets(
  cfg: CompoundChainConfig,
  opts: DiscoveryAssetsOptions = {},
): DiscoveryAsset[] {
  const tokensPerAsset = opts.tokensPerAsset ?? 1;
  const baseDecimals = opts.baseDecimals ?? 6;
  const scale = (decimals: number) => BigInt(tokensPerAsset) * 10n ** BigInt(decimals);

  const base: DiscoveryAsset = {
    symbol: cfg.baseAsset.displaySymbol,
    address: cfg.baseAsset.address,
    decimals: baseDecimals,
    amount: scale(baseDecimals),
  };

  const collaterals: DiscoveryAsset[] = Object.values(cfg.collateralAssets).map((c) => ({
    symbol: c.symbol,
    address: c.address,
    decimals: c.decimals,
    amount: scale(c.decimals),
  }));

  return [base, ...collaterals];
}
