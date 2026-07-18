// Server-side on-chain read for the front-page pool stats + market rows.
// Enumerates the comet (baseToken / baseTokenPriceFeed / numAssets + getAssetInfo)
// then reuses the merged, batched `readReserveReads` (Multicall3) — so the
// landing's TVL / APR / utilization / per-asset sizes come from the same path the
// connected app uses. Pure mappers (mapPoolNumbers / mapMarketRows) are unit
// tested; `readOnchainMarket` is the thin I/O wrapper (verified live).

import { COMET_PORTAL_ABI } from "../portal/abi";
import { readReserveReads, type ReserveReads, type AssetFeedInput } from "../portal/reads";
import { readCometAssetSymbols, type CometAssetSymbol, type CometReadClient } from "../lane/cometAssetSymbols";
import type { Address } from "viem";
import type { MarketRow } from "./MarketSource";

const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;

export interface PoolNumbers {
  totalSuppliedUsd: number;
  totalBorrowedUsd: number;
  supplyAprPct: number;
  borrowAprPct: number;
  utilizationPct: number;
}

/** Reserve reads → USD totals + annualised APRs + utilization%. Pure. */
export function mapPoolNumbers(r: ReserveReads, baseDecimals: number): PoolNumbers {
  const baseScale = 10 ** baseDecimals;
  const basePriceUsd = Number(r.basePrice) / 1e8;
  return {
    totalSuppliedUsd: (Number(r.totalSupply) / baseScale) * basePriceUsd,
    totalBorrowedUsd: (Number(r.totalBorrow) / baseScale) * basePriceUsd,
    // Compound per-second rate is 1e18-scaled → annualise to a percentage.
    supplyAprPct: (Number(r.supplyRate) / 1e18) * SECONDS_PER_YEAR * 100,
    borrowAprPct: (Number(r.borrowRate) / 1e18) * SECONDS_PER_YEAR * 100,
    // getUtilization is a 1e18-scaled fraction → whole-number percent.
    utilizationPct: (Number(r.utilization) / 1e18) * 100,
  };
}

/**
 * Reserve reads + canonical symbols → one base row + one row per collateral. Pure.
 * `collateralFactorsE18` are the borrowCollateralFactor (1e18-scaled) per
 * collateral, aligned with the non-base assets in `ordered` / `r.collats` order.
 */
export function mapMarketRows(
  r: ReserveReads,
  ordered: CometAssetSymbol[],
  pool: PoolNumbers,
  collateralFactorsE18: bigint[] = [],
): MarketRow[] {
  const base = ordered.find((o) => o.isBase) ?? ordered[0];
  const rows: MarketRow[] = [
    {
      asset: base?.symbol ?? "—",
      kind: "base",
      supplyApy: pool.supplyAprPct,
      borrowApy: pool.borrowAprPct,
      total: pool.totalSuppliedUsd,
      util: pool.utilizationPct,
      chains: ["evm", "sol"],
    },
  ];
  // Collaterals align with r.collats by enumeration order (getAssetInfo index).
  const collats = ordered.filter((o) => !o.isBase);
  collats.forEach((o, i) => {
    const c = r.collats[i];
    if (!c) return;
    const sizeUsd = (Number(c.supplyRaw) / 10 ** o.decimals) * (Number(c.priceX8) / 1e8);
    const factorE18 = collateralFactorsE18[i];
    rows.push({
      asset: o.symbol,
      kind: "collateral",
      supplyApy: 0, // Compound v3 collaterals don't earn supply APY
      borrowApy: 0,
      total: sizeUsd,
      util: 0,
      chains: ["evm", "sol"],
      // borrowCollateralFactor is 1e18-scaled → percent (0.8e18 → 80).
      collateralFactorPct: factorE18 != null ? Number(factorE18 / 10n ** 14n) / 100 : undefined,
    });
  });
  return rows;
}

export interface OnchainMarket {
  pool: PoolNumbers;
  markets: MarketRow[];
  baseToken: Address;
  baseDecimals: number;
  basePriceUsd: number;
  /** lowercased token address → { symbol, decimals } — for activity-row labels. */
  symbolByAddr: Record<string, { symbol: string; decimals: number }>;
  /** The raw reserve bigints already read for this market. The EVM lane's
   *  capacity math needs exact supply/borrow/price/rates — not the USD-mapped
   *  numbers above — so they ride along here (no 2nd multicall) for the shared
   *  cache to serialize across the JSON boundary (lib/market/bigintJson). */
  raw: ReserveReads;
}

/**
 * Enumerate the comet + batch-read its reserves, mapped to pool numbers + market
 * rows. `client` is any viem-shaped read client (the live source builds one
 * server-side against the chain RPC with Multicall3).
 */
export async function readOnchainMarket(client: CometReadClient, comet: Address): Promise<OnchainMarket> {
  const [baseToken, baseTokenPriceFeed, numAssetsRaw] = await Promise.all([
    client.readContract({ address: comet, abi: COMET_PORTAL_ABI, functionName: "baseToken" }) as Promise<Address>,
    client.readContract({ address: comet, abi: COMET_PORTAL_ABI, functionName: "baseTokenPriceFeed" }) as Promise<Address>,
    client.readContract({ address: comet, abi: COMET_PORTAL_ABI, functionName: "numAssets" }) as Promise<number>,
  ]);
  const numAssets = Number(numAssetsRaw);

  const infos = await client.multicall({
    allowFailure: true,
    contracts: Array.from({ length: numAssets }, (_, i) => ({
      address: comet,
      abi: COMET_PORTAL_ABI,
      functionName: "getAssetInfo",
      args: [i],
    })),
  });
  type AssetInfo = { asset: Address; priceFeed: Address; borrowCollateralFactor: bigint };
  const infoTuples = infos
    .map((r) => (r.status === "success" ? (r.result as AssetInfo) : null))
    .filter((a): a is AssetInfo => a != null);
  const assets: AssetFeedInput[] = infoTuples.map((a) => ({ asset: a.asset, priceFeed: a.priceFeed }));
  // Aligned with the collateral order mapMarketRows iterates (getAssetInfo index).
  const collateralFactorsE18 = infoTuples.map((a) => a.borrowCollateralFactor);

  const { ordered } = await readCometAssetSymbols(client, comet, baseToken);
  const reserves = await readReserveReads(client, comet, baseToken, baseTokenPriceFeed, assets);

  const baseDecimals = ordered.find((o) => o.isBase)?.decimals ?? 6;
  const pool = mapPoolNumbers(reserves, baseDecimals);
  const markets = mapMarketRows(reserves, ordered, pool, collateralFactorsE18);
  const symbolByAddr: Record<string, { symbol: string; decimals: number }> = {};
  for (const o of ordered) symbolByAddr[o.address.toLowerCase()] = { symbol: o.symbol, decimals: o.decimals };
  return { pool, markets, baseToken, baseDecimals, basePriceUsd: Number(reserves.basePrice) / 1e8, symbolByAddr, raw: reserves };
}
