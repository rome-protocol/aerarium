// The SINGLE source of the position TOTALS both lanes display.
//
// Both lanes read the SAME Compound v3 Comet but from different chains (EVM via
// wagmi, Solana-native via the synthetic EVM address over /api/rome-rpc). The
// per-asset reads therefore differ, but folding them into the position summary
// is identical math. Previously mapEvmPosition + mapSolanaPosition each computed
// supplied / borrowed / netApr / pricesStale / health-clamping independently —
// same formulas, two code paths, drift risk. This module is that one path: the
// mappers build their lane-specific LaneAsset[] + the two scalars that genuinely
// can't be derived from LaneAsset alone (capacity, healthFactor), then delegate
// the totals here.

import type { LaneAsset } from "@/components/aerarium/lane/types";

/** Health factor the presentational layer can render — Comet's Infinity (no
 *  debt) is clamped to a large finite number. */
export const HEALTH_FACTOR_NO_DEBT = 99;

export function clampHealthFactor(hf: number): number {
  if (!Number.isFinite(hf) || hf > HEALTH_FACTOR_NO_DEBT) return HEALTH_FACTOR_NO_DEBT;
  return hf;
}

/**
 * Best-effort net APR for the position summary — a display-only roll-up, not an
 * accounting figure. Net annual yield as a percentage of total supplied value:
 *   net annual $ = Σ(supplied_i × supplyApy_i) − Σ(borrowed_i × borrowApy_i)
 *   netApr%      = net annual $ / total supplied × 100
 * When nothing is supplied, returns 0.
 */
export function computeNetApr(assets: LaneAsset[]): number {
  let annualEarn = 0;
  let annualPay = 0;
  let totalSupplied = 0;
  for (const a of assets) {
    annualEarn += a.suppliedBal * (a.supplyApy / 100);
    annualPay += a.borrowedBal * (a.borrowApy / 100);
    totalSupplied += a.suppliedBal;
  }
  if (totalSupplied <= 0) return 0;
  return ((annualEarn - annualPay) / totalSupplied) * 100;
}

export interface PositionStatsInput {
  /** Borrow capacity in USD. Lane-specific source (EVM: the on-chain account
   *  stats hook; Solana: Σ collateralUSD × borrowCollateralFactor). Capacity
   *  needs the per-asset collateral factor, which LaneAsset doesn't carry, so it
   *  stays an input rather than being re-derived here. */
  capacityUsd: number;
  /** Pre-computed health factor. Lane-specific: the EVM lane passes Comet's real
   *  liquidation-based health (from the account stats hook); the Solana lane
   *  passes its capacity/borrowed ratio. `null` → no debt / not derivable → the
   *  no-debt sentinel. Deliberately NOT derived here from capacity/borrowed —
   *  that would regress the EVM lane to the Solana approximation, which uses the
   *  borrow collateral factor where liquidation uses a different one. */
  healthFactor: number | null;
}

export interface PositionStats {
  supplied: number;
  borrowed: number;
  capacity: number;
  healthFactor: number;
  netApr: number;
  pricesStale: boolean;
}

/**
 * Fold a lane's per-asset LaneAsset[] + its two lane-specific scalars into the
 * shared position totals. Pure.
 *
 *  - supplied / borrowed: Σ of the per-asset USD balances, so the header total
 *    always equals the sum of the visible rows (no drift between the two).
 *  - capacity: passed through (see PositionStatsInput).
 *  - healthFactor: clamped; null / Infinity → the no-debt sentinel.
 *  - netApr: supply-weighted minus borrow-weighted roll-up.
 *  - pricesStale: the user HOLDS a collateral whose price is unknown (its OG-V2
 *    feed is stale / reverting). That's what makes capacity + health
 *    untrustworthy; an unheld stale-feed asset or a stale BASE feed doesn't flip
 *    it (the base is the unit of account, valued ≈ $1 independent of its feed).
 */
export function computePositionStats(assets: LaneAsset[], input: PositionStatsInput): PositionStats {
  let supplied = 0;
  let borrowed = 0;
  for (const a of assets) {
    supplied += a.suppliedBal;
    borrowed += a.borrowedBal;
  }

  const pricesStale = assets.some(
    (a) => a.collateral === true && a.suppliedTokens > 0 && a.priceKnown === false,
  );

  return {
    supplied,
    borrowed,
    capacity: input.capacityUsd,
    healthFactor:
      input.healthFactor == null ? clampHealthFactor(Infinity) : clampHealthFactor(input.healthFactor),
    netApr: computeNetApr(assets),
    pricesStale,
  };
}
