// Live per-user account stats for one Comet market:
// collateral $, base supply $, borrow $, health factor, available-to-borrow,
// PLUS the per-collateral position breakdown for table rendering.
//
// Inputs:
//   - market (from useCometMarket) — has per-asset configs + base price feed
//   - user (wallet address) — null when disconnected
//   - collatSymbolByAddress — display symbol map from registry config
//     (asset address → "PCOL", "MOCK", etc.) so the table can render labels.

"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { computeUserAccountStats, type AccountStats, type CollateralPosition } from "../stats";
import type { CometMarket } from "./useCometMarket";
import { readAccountReads } from "../reads";

const REFRESH_MS = 12_000;

export interface AccountStatsResult {
  stats: AccountStats | null;
  /** Per-collateral position breakdown for the table — populated alongside `stats`. */
  positions: CollateralPosition[];
  /** Base supply position raw value (for the base-supply row). */
  baseSupplyBalance: bigint | null;
  /** Base borrow position raw value (for the borrow row). */
  baseBorrowBalance: bigint | null;
  /** Whether the on-chain `isBorrowCollateralized` check passes. */
  isBorrowCollateralized: boolean | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAccountStats(
  market: CometMarket | null,
  user: Address | undefined,
  baseDecimals: number,
  decimalsByAsset: Record<string, number>,
  symbolByAsset: Record<string, string>,
  chainId: number,
): AccountStatsResult {
  const publicClient = usePublicClient({ chainId });
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [positions, setPositions] = useState<CollateralPosition[]>([]);
  const [baseSupplyBalance, setBaseSupplyBalance] = useState<bigint | null>(null);
  const [baseBorrowBalance, setBaseBorrowBalance] = useState<bigint | null>(null);
  const [isBorrowCollateralized, setIsBorrowCollateralized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!market || !user || !publicClient) {
      setStats(null);
      setPositions([]);
      setBaseSupplyBalance(null);
      setBaseBorrowBalance(null);
      setIsBorrowCollateralized(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Single batched read: base supply/borrow + base price +
      // isBorrowCollateralized + every collateral's (userCollateral, price) in
      // one multicall. Replaces 4 + 2N sequential ~1s eth_calls.
      const reads = await readAccountReads(
        publicClient,
        market.comet,
        market.baseTokenPriceFeed,
        user,
        market.assets,
        market.numAssets,
      );

      const perAsset = market.assets.map((a, i): CollateralPosition => {
        const { balance, priceX8 } = reads.perAsset[i];
        const symbol = symbolByAsset[a.asset.toLowerCase()] ?? `asset${a.index}`;
        const decimals = decimalsByAsset[a.asset.toLowerCase()] ?? scaleToDecimals(a.scale);
        return {
          asset: a.asset,
          symbol,
          balance,
          decimals,
          priceUSDx8: priceX8,
          liquidateCollateralFactor: a.liquidateCollateralFactor,
          borrowCollateralFactor: a.borrowCollateralFactor,
          supplyCap: a.supplyCap,
        };
      });

      const computed = computeUserAccountStats({
        baseToken: market.baseToken,
        baseDecimals,
        basePriceUSDx8: reads.basePrice,
        borrowBalanceBase: reads.borrowBal,
        supplyBalanceBase: reads.supplyBal,
        collaterals: perAsset,
      });

      setStats(computed);
      setPositions(perAsset);
      setBaseSupplyBalance(reads.supplyBal);
      setBaseBorrowBalance(reads.borrowBal);
      setIsBorrowCollateralized(reads.collateralized);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load account stats";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [market, user, publicClient, baseDecimals, decimalsByAsset, symbolByAsset]);

  useEffect(() => {
    load();
    if (!market || !user) return;
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load, market, user]);

  return {
    stats,
    positions,
    baseSupplyBalance,
    baseBorrowBalance,
    isBorrowCollateralized,
    loading,
    error,
    refresh: load,
  };
}

/** Compound's per-asset `scale` is 10^decimals — invert it. */
function scaleToDecimals(scale: bigint): number {
  let d = 0;
  let s = scale;
  while (s > 1n) {
    s /= 10n;
    d += 1;
  }
  return d;
}
