// The EVM lane's per-user T0 read, as ONE pure async fetcher for usePositionQuery
// to call. It composes the EXISTING pure reads — readAccountReads (the position
// multicall) + readWalletBalances (the wallet ERC20 multicall) — and the SAME
// perAsset → CollateralPosition mapping + computeUserAccountStats derivation that
// useAccountStats does today (behavior-preserving; the hook stays for its other
// consumers). No new on-chain shape, no JSON boundary (runs client-side, bigints
// pass straight to mapEvmPosition) — so the parity firewall only has to prove the
// assembly matches, not a serialize round-trip.

import type { Address, PublicClient } from "viem";
import { readAccountReads, readWalletBalances } from "@/lib/portal/reads";
import { computeUserAccountStats, type AccountStats, type CollateralPosition } from "@/lib/portal/stats";
import type { CometMarket } from "@/lib/portal/hooks/useCometMarket";

/** The exact inputs mapEvmPosition needs, gathered in one query tick. */
export interface EvmPositionReads {
  stats: AccountStats;
  positions: CollateralPosition[];
  baseSupplyBalance: bigint;
  baseBorrowBalance: bigint;
  isBorrowCollateralized: boolean;
  walletBalances: Record<string, bigint>;
}

export interface FetchEvmPositionArgs {
  publicClient: PublicClient;
  market: CometMarket;
  baseAsset: Address;
  user: Address;
  baseDecimals: number;
  decimalsByAsset: Record<string, number>;
  symbolByAsset: Record<string, string>;
}

export async function fetchEvmPosition({
  publicClient,
  market,
  baseAsset,
  user,
  baseDecimals,
  decimalsByAsset,
  symbolByAsset,
}: FetchEvmPositionArgs): Promise<EvmPositionReads> {
  const [reads, walletBalances] = await Promise.all([
    readAccountReads(publicClient, market.comet, market.baseTokenPriceFeed, user, market.assets, market.numAssets),
    readWalletBalances(publicClient, baseAsset, market.assets.map((a) => a.asset), user),
  ]);

  // Same mapping as useAccountStats — symbol/decimals fall back identically.
  const positions: CollateralPosition[] = market.assets.map((a, i) => {
    const { balance, priceX8 } = reads.perAsset[i];
    return {
      asset: a.asset,
      symbol: symbolByAsset[a.asset.toLowerCase()] ?? `asset${a.index}`,
      balance,
      decimals: decimalsByAsset[a.asset.toLowerCase()] ?? scaleToDecimals(a.scale),
      priceUSDx8: priceX8,
      liquidateCollateralFactor: a.liquidateCollateralFactor,
      borrowCollateralFactor: a.borrowCollateralFactor,
      supplyCap: a.supplyCap,
    };
  });

  const stats = computeUserAccountStats({
    baseToken: market.baseToken,
    baseDecimals,
    basePriceUSDx8: reads.basePrice,
    borrowBalanceBase: reads.borrowBal,
    supplyBalanceBase: reads.supplyBal,
    collaterals: positions,
  });

  return {
    stats,
    positions,
    baseSupplyBalance: reads.supplyBal,
    baseBorrowBalance: reads.borrowBal,
    isBorrowCollateralized: reads.collateralized,
    walletBalances,
  };
}

/** Compound's per-asset `scale` is 10^decimals — invert it (mirrors useAccountStats). */
function scaleToDecimals(scale: bigint): number {
  let d = 0;
  let s = scale;
  while (s > 1n) {
    s /= 10n;
    d += 1;
  }
  return d;
}
