// Pure Comet → Aerarium-lane mapping for the Solana-native lane.
//
// The Solana-native lane (useSolanaLane) reads the SAME Compound v3 Comet as the
// EVM lane, but for a *synthetic* EVM address derived from the connected Solana
// pubkey (keccak(pubkey)[12:]). The reads are issued with viem against the demo's
// /api/rome-rpc proxy — identical contract calls to the discovery probe's
// readState. This module folds those raw reads into the designer's LanePosition
// shape and stays async-free / wallet-free so it's unit-testable in isolation
// (mirrors lib/lane/mapEvmPosition.ts).
//
// USD convention (same as mapEvmPosition): every *Bal field on LaneAsset and
// every total on LanePosition is a USD number; the presentational layer formats
// with fmt$. Raw token balances are converted with the per-asset 1e8-scaled
// price. Base wUSDC ≈ $1.

import type { LaneAsset, LaneLimits, LanePosition } from "@/components/aerarium/lane/types";
import { displayNameForSymbol } from "./mapEvmPosition";
import { computePositionStats } from "./positionStats";
import { cappedBaseLiquidityRaw } from "./availableLiquidity";

const PRICE_SCALE = 1e8;

export function tokenToUSD(raw: bigint, decimals: number, priceUSDx8: bigint): number {
  if (raw === 0n || priceUSDx8 === 0n) return 0;
  return (Number(raw) / 10 ** decimals) * (Number(priceUSDx8) / PRICE_SCALE);
}

/** Raw balance → whole-token count (token-denominated, not USD). */
function tokenAmount(raw: bigint, decimals: number): number {
  if (raw === 0n) return 0;
  return Number(raw) / 10 ** decimals;
}

/** One asset as the Solana lane reads it from chain. Base is identified by
 *  `isBase`; collaterals carry their per-asset collateralBalanceOf. */
export interface SolanaAssetRead {
  symbol: string;
  /** Wrapper (SPL_ERC20) address — the EVM contract the lane reads. */
  address: string;
  decimals: number;
  /** true for the Comet base asset (wUSDC) — gets supply + borrow columns. */
  isBase: boolean;
  /** 1e8-scaled USD price (base ≈ 1e8; collats from the Comet price feed). */
  priceUSDx8: bigint;
  /** wrapper.balanceOf(synthetic) — the user's spendable wallet balance. */
  walletRaw: bigint;
  /** Base: comet.balanceOf(synthetic). Collateral: comet.collateralBalanceOf. */
  suppliedRaw: bigint;
  /** Base only: comet.borrowBalanceOf(synthetic). 0 for collaterals. */
  borrowedRaw: bigint;
  /** 1e18-scaled Compound borrowCollateralFactor; 0 for the base asset. Carried
   *  through to LaneAsset.borrowCollateralFactor so laneActions can size a
   *  collateral withdraw off the capacity it frees (the SAME factor that already
   *  feeds borrowCapacityUSD in buildSolanaReadsAndStats). */
  borrowCollateralFactorE18: bigint;
  /** Supply APY % — best-effort (see useSolanaLane); 0 for collateral-only. */
  supplyApyPct: number;
  /** Borrow APY % — base only, best-effort; 0 marks collateral-only. */
  borrowApyPct: number;
  /** Underlying SPL mint (base58) — the Solana-lane on-chain identity to DISPLAY
   *  (the EVM wrapper address is the keying id; the mint is what a Solana user
   *  recognises). Best-effort: undefined when the wrapper.mint_id read failed. */
  mint?: string;
}

/** One asset with every value the position needs already resolved (balances +
 *  1e8 price + collateral factor). Produced by the hook from a batched
 *  multicall, then folded into reads + capacity/health by buildSolanaReadsAndStats. */
export interface SolanaAssetResolved {
  symbol: string;
  address: string;
  decimals: number;
  isBase: boolean;
  priceUSDx8: bigint;
  walletRaw: bigint;
  suppliedRaw: bigint;
  borrowedRaw: bigint;
  /** 1e18-scaled Compound borrowCollateralFactor; 0 for the base asset. */
  borrowCollateralFactorE18: bigint;
  supplyApyPct: number;
  borrowApyPct: number;
  /** Underlying SPL mint (base58) for display; carried through to SolanaAssetRead. */
  mint?: string;
}

/** Market-level (wallet-independent) reads for the Solana lane's limits — the
 *  SAME quantities the EVM lane derives from reserves/comet views, read here via
 *  the lane's own multicall. Optional: when omitted, buildSolanaReadsAndStats
 *  returns no `limits` and the lane falls back to balance-only ceilings. */
export interface SolanaMarketRead {
  /** comet.totalSupply() of the base, raw base smallest-units. */
  totalSupplyBaseRaw: bigint;
  /** comet.totalBorrow() of the base, raw base smallest-units. */
  totalBorrowBaseRaw: bigint;
  /** comet.baseBorrowMin(), raw base smallest-units. */
  baseBorrowMinRaw: bigint;
  /** baseToken.balanceOf(comet) — the base the Comet PHYSICALLY holds. The real
   *  withdraw/borrow ceiling (it can only transfer base it has); lower than
   *  totalSupply − totalBorrow when the Comet runs a base deficit. null when the
   *  read failed → fall back to the accounting net (never block). */
  baseBalanceRaw: bigint | null;
  baseDecimals: number;
  /** 1e8-scaled base price (≈ 1e8 for wUSDC). */
  basePriceUSDx8: bigint;
}

/**
 * Fold resolved per-asset reads into the SolanaAssetRead[] the mapper consumes
 * plus the account stats. Pure (no hooks / no RPC) so the capacity + health math
 * is unit-testable in isolation:
 *   - borrowCapacityUSD = Σ over collaterals (collateralUSD × borrowCollateralFactor)
 *   - borrowed is the BASE asset's debt only (collateral borrowedRaw ignored)
 *   - healthFactor = capacity / borrowed, or null when there's no debt
 *   - limits (when `market` passed) = the min-of-all-constraints market seam:
 *       availableLiquidityUsd = min(totalSupply − totalBorrow, balanceOf(comet)) × base price,
 *       baseBorrowMinUsd      = baseBorrowMin × base price
 * A zero price (unresolved feed) contributes 0, never NaN.
 */
export function buildSolanaReadsAndStats(
  resolved: SolanaAssetResolved[],
  market?: SolanaMarketRead,
): {
  reads: SolanaAssetRead[];
  borrowCapacityUSD: number;
  healthFactor: number | null;
  limits?: LaneLimits;
} {
  const reads: SolanaAssetRead[] = resolved.map((r) => ({
    symbol: r.symbol,
    address: r.address,
    mint: r.mint,
    decimals: r.decimals,
    isBase: r.isBase,
    priceUSDx8: r.priceUSDx8,
    walletRaw: r.walletRaw,
    suppliedRaw: r.suppliedRaw,
    borrowedRaw: r.borrowedRaw,
    borrowCollateralFactorE18: r.borrowCollateralFactorE18,
    supplyApyPct: r.supplyApyPct,
    borrowApyPct: r.borrowApyPct,
  }));

  let weightedCapUSD = 0;
  let borrowedUSD = 0;
  for (const r of resolved) {
    if (r.isBase) {
      borrowedUSD = tokenToUSD(r.borrowedRaw, r.decimals, r.priceUSDx8);
    } else {
      const suppliedUSD = tokenToUSD(r.suppliedRaw, r.decimals, r.priceUSDx8);
      const cf = Number(r.borrowCollateralFactorE18) / 1e18;
      weightedCapUSD += suppliedUSD * cf;
    }
  }

  let limits: LaneLimits | undefined;
  if (market) {
    // min(accounting net, physical base balance) — the base the Comet can
    // actually pay out. A base deficit caps below the net (parity with the EVM
    // lane's availableLiquidityRaw).
    const availRaw = cappedBaseLiquidityRaw(
      market.totalSupplyBaseRaw,
      market.totalBorrowBaseRaw,
      market.baseBalanceRaw,
    );
    limits = {
      availableLiquidityUsd: tokenToUSD(availRaw, market.baseDecimals, market.basePriceUSDx8),
      baseBorrowMinUsd: tokenToUSD(market.baseBorrowMinRaw, market.baseDecimals, market.basePriceUSDx8),
    };
  }

  return {
    reads,
    borrowCapacityUSD: weightedCapUSD,
    healthFactor: borrowedUSD > 0 ? weightedCapUSD / borrowedUSD : null,
    limits,
  };
}

export interface MapSolanaPositionInput {
  /** Base first, then one entry per collateral (display order). */
  assets: SolanaAssetRead[];
  /**
   * Borrow capacity in USD — Σ(collateral USD × borrowCollateralFactor). Read
   * best-effort from getAssetInfo factors; pass 0 if not resolved (the lane
   * still renders + supply/borrow still work). See useSolanaLane.
   */
  borrowCapacityUSD: number;
  /**
   * Account health factor (borrowCapacity / borrowed). Pass null when there's
   * no debt or it couldn't be derived — mapped to the no-debt sentinel.
   */
  healthFactor: number | null;
  /** Market-level limits for the min-of-all-constraints model (from
   *  buildSolanaReadsAndStats(resolved, market).limits). Optional — omitted →
   *  the lane falls back to balance-only ceilings. */
  limits?: LaneLimits;
}

/**
 * Build the designer's LanePosition from the Solana lane's Comet reads.
 *
 * Asset rows: base first (supply + borrow APY, collateral:false), then each
 * collateral (supplyApy best-effort, borrowApy 0, collateral:true). Totals use
 * the same USD framing as the EVM lane:
 *   - supplied = baseSupplyUSD + Σ collateralUSD
 *   - borrowed = baseBorrowUSD
 *   - capacity = borrowCapacityUSD (best-effort input)
 *   - healthFactor = input (Infinity/no-debt clamped for display)
 */
export function mapSolanaPosition(input: MapSolanaPositionInput): LanePosition {
  const assets: LaneAsset[] = input.assets.map((a) => {
    const walletBal = tokenToUSD(a.walletRaw, a.decimals, a.priceUSDx8);
    const suppliedBal = tokenToUSD(a.suppliedRaw, a.decimals, a.priceUSDx8);
    const borrowedBal = a.isBase
      ? tokenToUSD(a.borrowedRaw, a.decimals, a.priceUSDx8)
      : 0;
    return {
      sym: a.symbol,
      name: displayNameForSymbol(a.symbol),
      supplyApy: a.supplyApyPct ?? 0,
      // collateral-only assets carry borrowApy 0 (display rate only).
      borrowApy: a.isBase ? a.borrowApyPct ?? 0 : 0,
      // Only the Comet base asset is borrowable — independent of borrowApy.
      borrowable: a.isBase,
      walletBal,
      suppliedBal,
      borrowedBal,
      // Token-unit balances straight from the raw reads + decimals (the amount
      // field / Max / validation are token-denominated).
      walletTokens: tokenAmount(a.walletRaw, a.decimals),
      suppliedTokens: tokenAmount(a.suppliedRaw, a.decimals),
      borrowedTokens: a.isBase ? tokenAmount(a.borrowedRaw, a.decimals) : 0,
      priceUsd: a.priceUSDx8 === 0n ? 0 : Number(a.priceUSDx8) / PRICE_SCALE,
      // Price KNOWN unless the feed reverts (priceUSDx8 0). Consumers render the
      // token amount instead of "—"/$0 and gate honestly on a stale feed.
      priceKnown: a.priceUSDx8 > 0n,
      collateral: !a.isBase,
      // 0..1 borrow collateral factor (base = 0). Lets laneActions size a
      // collateral withdraw against the capacity it frees (same 1e18 factor that
      // feeds borrowCapacityUSD).
      borrowCollateralFactor: Number(a.borrowCollateralFactorE18) / 1e18,
      address: a.address,
      // Solana lane: display the underlying SPL mint (what a Solana user knows);
      // fall back to the EVM wrapper address if the mint read was unavailable.
      displayAddress: a.mint ?? a.address,
      decimals: a.decimals,
    } satisfies LaneAsset;
  });

  // Totals + health + pricesStale via the one shared calc both lanes use
  // (computePositionStats). supplied/borrowed derive from `assets`; capacity +
  // healthFactor are the Solana-specific scalars from buildSolanaReadsAndStats
  // (capacity = Σ collateralUSD × borrowCollateralFactor; healthFactor =
  // capacity/borrowed, null when no debt → no-debt sentinel). The pricesStale
  // predicate (a HELD collateral with an unknown price) is now expressed on the
  // built LaneAsset rows — equivalent to the old raw-read check.
  return {
    ...computePositionStats(assets, {
      capacityUsd: input.borrowCapacityUSD,
      healthFactor: input.healthFactor,
    }),
    assets,
    limits: input.limits,
  };
}
