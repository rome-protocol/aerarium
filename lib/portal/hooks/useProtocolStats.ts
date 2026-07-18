// Live protocol-aggregate stats for one Comet market:
// TVL ($), total borrow ($), utilization, supply APY, borrow APY.
//
// Refreshes on a fixed interval — Compound rates accrue per-second on-chain
// so a 12-second poll matches roughly one Solana slot bundle's worth of
// drift, plenty granular for a display.

"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { COMET_PORTAL_ABI } from "../abi";
import { computeProtocolStats, type ProtocolStats } from "../stats";
import type { CometMarket } from "./useCometMarket";

const REFRESH_MS = 12_000;

export function useProtocolStats(market: CometMarket | null, baseDecimals: number, chainId: number): {
  stats: ProtocolStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const publicClient = usePublicClient({ chainId });
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!market || !publicClient) return;
    setLoading(true);
    setError(null);
    try {
      const [totalSupply, totalBorrow, utilization, basePrice] = await Promise.all([
        publicClient.readContract({
          address: market.comet,
          abi: COMET_PORTAL_ABI,
          functionName: "totalSupply",
        }),
        publicClient.readContract({
          address: market.comet,
          abi: COMET_PORTAL_ABI,
          functionName: "totalBorrow",
        }),
        publicClient.readContract({
          address: market.comet,
          abi: COMET_PORTAL_ABI,
          functionName: "getUtilization",
        }),
        publicClient.readContract({
          address: market.comet,
          abi: COMET_PORTAL_ABI,
          functionName: "getPrice",
          args: [market.baseTokenPriceFeed],
        }),
      ]);

      // Rate reads depend on the just-fetched utilization — second hop.
      const [supplyRate, borrowRate] = await Promise.all([
        publicClient.readContract({
          address: market.comet,
          abi: COMET_PORTAL_ABI,
          functionName: "getSupplyRate",
          args: [utilization as bigint],
        }),
        publicClient.readContract({
          address: market.comet,
          abi: COMET_PORTAL_ABI,
          functionName: "getBorrowRate",
          args: [utilization as bigint],
        }),
      ]);

      setStats(
        computeProtocolStats({
          totalSupplyBase: totalSupply as bigint,
          totalBorrowBase: totalBorrow as bigint,
          baseDecimals,
          basePriceUSDx8: basePrice as bigint,
          utilizationScaled: utilization as bigint,
          supplyRatePerSecondScaled: BigInt(supplyRate as bigint),
          borrowRatePerSecondScaled: BigInt(borrowRate as bigint),
        }),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load protocol stats";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [market, publicClient, baseDecimals]);

  useEffect(() => {
    load();
    if (!market) return;
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load, market]);

  return { stats, loading, error, refresh: load };
}
