"use client";

import { useCallback, useMemo } from "react";
import type { Address } from "viem";
import type { CometMarket } from "./useCometMarket";
import type { ReserveReads } from "../reads";
import { useMarket } from "@/lib/market/useMarket";

const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;

export interface ReserveStat {
  kind: "base" | "collateral";
  asset: Address;
  priceFeed: Address;
  decimals: number;
  totalSupplyRaw: bigint;
  totalSupplyUSD: number;
  totalBorrowRaw: bigint | null;
  totalBorrowUSD: number | null;
  supplyApyPct: number | null;
  borrowApyPct: number | null;
  borrowCollateralFactorPct: number;
  /** Base row only: baseToken.balanceOf(comet) — the base the Comet physically
   *  holds (the real withdraw/borrow ceiling). Absent/null on collat rows
   *  (base-only) and when the read failed. Only the EVM lane's liquidity cap
   *  reads it; other reserve-row consumers ignore it. */
  baseBalanceRaw?: bigint | null;
}

export interface UseReserveStatsResult {
  reserves: ReserveStat[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Pure: raw reserve bigints + the comet's asset shape → one ReserveStat per
 * asset (1 base + N collats). Base row carries totals / APYs; collat rows carry
 * size + collateral-factor (Compound v3 collats don't earn or count toward
 * totalBorrow, so those fields are null). `reads.collats[i]` aligns with
 * `market.assets[i]` (both follow getAssetInfo index order).
 *
 * This is the SAME derivation the hook used against a fresh readReserveReads;
 * factored out so the frozen-fixture parity test can prove the shared-cache's
 * serialize→revive round-trip doesn't corrupt the capacity math (Issue 12).
 */
export function deriveReserveStats(reads: ReserveReads, market: CometMarket, baseDecimals: number): ReserveStat[] {
  const collatRows: ReserveStat[] = market.assets.map((a, i): ReserveStat => {
    const { supplyRaw, priceX8 } = reads.collats[i];
    const scale = Number(a.scale);
    const priceUSD = Number(priceX8) / 1e8;
    return {
      kind: "collateral",
      asset: a.asset,
      priceFeed: a.priceFeed,
      decimals: Math.round(Math.log10(scale)),
      totalSupplyRaw: supplyRaw,
      totalSupplyUSD: (Number(supplyRaw) / scale) * priceUSD,
      totalBorrowRaw: null,
      totalBorrowUSD: null,
      supplyApyPct: null,
      borrowApyPct: null,
      // 1e18 scale → percent. Integer-divide by 1e14 first to stay within
      // Number's safe range (factors like 7e17 exceed 2^53), then /100.
      borrowCollateralFactorPct: Number(a.borrowCollateralFactor / 10n ** 14n) / 100,
      baseBalanceRaw: null, // base-only concept
    };
  });

  const supplyApyPct = (Number(reads.supplyRate) / 1e18) * SECONDS_PER_YEAR * 100;
  const borrowApyPct = (Number(reads.borrowRate) / 1e18) * SECONDS_PER_YEAR * 100;
  const baseScale = 10 ** baseDecimals;
  const basePriceUSD = Number(reads.basePrice) / 1e8;

  const baseRow: ReserveStat = {
    kind: "base",
    asset: market.baseToken,
    priceFeed: market.baseTokenPriceFeed,
    decimals: baseDecimals,
    totalSupplyRaw: reads.totalSupply,
    totalSupplyUSD: (Number(reads.totalSupply) / baseScale) * basePriceUSD,
    totalBorrowRaw: reads.totalBorrow,
    totalBorrowUSD: (Number(reads.totalBorrow) / baseScale) * basePriceUSD,
    supplyApyPct,
    borrowApyPct,
    borrowCollateralFactorPct: 0,
    baseBalanceRaw: reads.baseBalanceRaw,
  };

  return [baseRow, ...collatRows];
}

/**
 * Per-asset reserve aggregates for a Comet market — now sourced from the shared
 * market cache (useMarket → /api/market, server-cached 30s) instead of a
 * per-tab 12s on-chain poll. Shape preserved exactly so useEvmLane + the
 * (dead) reserve tables are untouched; `refresh` re-fetches the shared cache
 * (post-action market-total freshness is bounded by the 30s window — the T2
 * tier; a user's own position is the separate T0 path). Renders pre-wallet.
 */
export function useReserveStats(
  market: CometMarket | null,
  baseDecimals: number,
  chainId: number,
): UseReserveStatsResult {
  const { data, isLoading, error, refetch } = useMarket(chainId);

  const reserves = useMemo(
    // Guard data?.state?.raw — a malformed/partial payload (or an errored query
    // with stale partial data) must yield null, never crash the derivation.
    () => (market && data?.state?.raw ? deriveReserveStats(data.state.raw, market, baseDecimals) : null),
    [market, data, baseDecimals],
  );

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    reserves,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    refresh,
  };
}
