// Fetch a Comet market's static-ish shape (base asset, price feeds, per-asset
// configs) once per Comet address.  Cached in component state — the values
// can only change after a Comet redeploy, so we don't refresh.
//
// Per-asset reads are batched: numAssets first, then N parallel
// getAssetInfo(i).  publicClient transparently batches via JSON-RPC.

"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { COMET_PORTAL_ABI } from "../abi";
import { readMarketCache, writeMarketCache } from "../marketCache";

export interface CometAssetConfig {
  index: number;
  asset: Address;
  priceFeed: Address;
  /** Asset scale, e.g. 1e18 for an 18-decimal token.  Compound stores as uint64. */
  scale: bigint;
  borrowCollateralFactor: bigint;
  liquidateCollateralFactor: bigint;
  liquidationFactor: bigint;
  supplyCap: bigint;
}

export interface CometMarket {
  comet: Address;
  baseToken: Address;
  baseTokenPriceFeed: Address;
  numAssets: number;
  assets: CometAssetConfig[];
}

/** Pull baseToken / baseTokenPriceFeed / numAssets + every getAssetInfo(i) entry. */
export function useCometMarket(comet: Address | undefined, chainId: number): {
  market: CometMarket | null;
  loading: boolean;
  error: string | null;
} {
  const publicClient = usePublicClient({ chainId });
  const [market, setMarket] = useState<CometMarket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!comet || !publicClient) return;
    // The Comet's shape is immutable until a redeploy (which mints a new
    // address — so the chainId+comet key self-invalidates). Seed instantly from
    // the per-tab cache so the asset list paints without the numAssets +
    // getAssetInfo round-trips, and dependent reads (prices, balances, user
    // positions) can start immediately instead of waiting on them.
    const cached = readMarketCache(chainId, comet);
    if (cached) {
      setMarket(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [baseToken, baseTokenPriceFeed, numAssetsRaw] = await Promise.all([
        publicClient.readContract({
          address: comet,
          abi: COMET_PORTAL_ABI,
          functionName: "baseToken",
        }),
        publicClient.readContract({
          address: comet,
          abi: COMET_PORTAL_ABI,
          functionName: "baseTokenPriceFeed",
        }),
        publicClient.readContract({
          address: comet,
          abi: COMET_PORTAL_ABI,
          functionName: "numAssets",
        }),
      ]);

      const numAssets = Number(numAssetsRaw);
      const assetInfos = await Promise.all(
        Array.from({ length: numAssets }, (_, i) =>
          publicClient.readContract({
            address: comet,
            abi: COMET_PORTAL_ABI,
            functionName: "getAssetInfo",
            args: [i],
          }),
        ),
      );

      const assets: CometAssetConfig[] = assetInfos.map((info, i) => ({
        index: i,
        asset: info.asset as Address,
        priceFeed: info.priceFeed as Address,
        scale: BigInt(info.scale),
        borrowCollateralFactor: BigInt(info.borrowCollateralFactor),
        liquidateCollateralFactor: BigInt(info.liquidateCollateralFactor),
        liquidationFactor: BigInt(info.liquidationFactor),
        supplyCap: BigInt(info.supplyCap),
      }));

      const built: CometMarket = {
        comet,
        baseToken: baseToken as Address,
        baseTokenPriceFeed: baseTokenPriceFeed as Address,
        numAssets,
        assets,
      };
      setMarket(built);
      writeMarketCache(chainId, comet, built);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load Comet market";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [comet, publicClient, chainId]);

  useEffect(() => {
    load();
  }, [load]);

  return { market, loading, error };
}
