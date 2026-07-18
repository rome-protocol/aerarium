// Failing tests for the portal stats pure-compute library.
//
// Contract: lib/portal/stats.ts exports four pure functions that take only
// typed scalar inputs (no contract reads, no async) and return derived
// portal-display values.  The hooks layer (lib/portal/hooks/*.ts) is
// responsible for fetching the raw on-chain inputs; these functions just
// do the math.
//
// Fails today because lib/portal/stats.ts does not exist yet.

import { describe, it, expect } from "vitest";
import {
  decodeAPYFromPerSecondRate,
  computeUtilizationPct,
  computeUserAccountStats,
  computeProtocolStats,
  type CollateralPosition,
  type AccountStatsInput,
  type ProtocolStatsInput,
} from "../stats";

// FACTOR_SCALE matches Compound v3's per-asset / per-rate scale constant
// (1e18).  Documented in Comet's CometMath.FACTOR_SCALE.
const FACTOR_SCALE = 10n ** 18n;
// PRICE_SCALE matches Comet's price-feed normalization (1e8).
const PRICE_SCALE = 10n ** 8n;

describe("decodeAPYFromPerSecondRate", () => {
  it("returns 0 for a zero rate", () => {
    expect(decodeAPYFromPerSecondRate(0n)).toBe(0);
  });

  it("decodes 5% APY from the equivalent per-second rate", () => {
    // 5% APY = (1+r)^31_536_000 = 1.05  ⇒  r ≈ 1.547e-9 per second
    // Compound stores this as r × 1e18 = 1.547e9 (rounded).
    const perSecondScaled = BigInt(Math.round(1.547125957863e-9 * 1e18));
    const apy = decodeAPYFromPerSecondRate(perSecondScaled);
    expect(apy).toBeGreaterThan(0.0499);
    expect(apy).toBeLessThan(0.0501);
  });

  it("matches the simple-interest linearization for tiny rates (Compound rates are tiny)", () => {
    // 1% APY equivalent per-second.  For a one-year compound, compounding
    // effect is ~0.5% extra on the linear estimate — i.e. very close.
    const perSecondScaled = BigInt(Math.round(3.155e-10 * 1e18));
    const apy = decodeAPYFromPerSecondRate(perSecondScaled);
    expect(apy).toBeGreaterThan(0.0098);
    expect(apy).toBeLessThan(0.0102);
  });
});

describe("computeUtilizationPct", () => {
  it("returns 0 when total supply is zero (avoid division by zero)", () => {
    expect(computeUtilizationPct(0n, 0n)).toBe(0);
  });

  it("returns 0 when supply > 0 but borrow is 0", () => {
    expect(computeUtilizationPct(1_000_000n, 0n)).toBe(0);
  });

  it("returns ~0.5 when half the supply is borrowed", () => {
    const u = computeUtilizationPct(2_000_000n, 1_000_000n);
    expect(u).toBeCloseTo(0.5, 6);
  });

  it("returns ~1 when fully utilized", () => {
    expect(computeUtilizationPct(1_000_000n, 1_000_000n)).toBeCloseTo(1, 6);
  });
});

// Fixture builder: hadrian-shaped user with optional PCOL position + optional borrow.
function makeAccountInput(
  opts: {
    pcolBalance?: bigint;
    pcolPriceUSDx8?: bigint;
    pcolDecimals?: number;
    pcolLcf?: bigint;
    pcolBcf?: bigint;
    borrowBase?: bigint;
    supplyBase?: bigint;
    basePriceUSDx8?: bigint;
    baseDecimals?: number;
  } = {},
): AccountStatsInput {
  const collats: CollateralPosition[] = [];
  if (opts.pcolBalance !== undefined) {
    collats.push({
      asset: "0x113A5f117D6E5324921d0434ade49a0659B67795",
      symbol: "PCOL",
      balance: opts.pcolBalance,
      decimals: opts.pcolDecimals ?? 18,
      priceUSDx8: opts.pcolPriceUSDx8 ?? 100n * PRICE_SCALE, // $100 per PCOL
      liquidateCollateralFactor: opts.pcolLcf ?? (FACTOR_SCALE * 85n) / 100n, // 85%
      borrowCollateralFactor: opts.pcolBcf ?? (FACTOR_SCALE * 75n) / 100n,    // 75%
      supplyCap: 1000n * 10n ** 18n,
    });
  }
  return {
    baseToken: "0xc1418f71Fdd16F8010382da1F796C2C90c6508b0",
    baseDecimals: opts.baseDecimals ?? 6,
    basePriceUSDx8: opts.basePriceUSDx8 ?? 1n * PRICE_SCALE, // $1
    borrowBalanceBase: opts.borrowBase ?? 0n,
    supplyBalanceBase: opts.supplyBase ?? 0n,
    collaterals: collats,
  };
}

describe("computeUserAccountStats", () => {
  it("returns all-zero / infinite-health for an empty account", () => {
    const stats = computeUserAccountStats(makeAccountInput());
    expect(stats.collateralValueUSD).toBe(0);
    expect(stats.baseSupplyValueUSD).toBe(0);
    expect(stats.borrowValueUSD).toBe(0);
    expect(stats.borrowCapacityUSD).toBe(0);
    expect(stats.liquidationThresholdUSD).toBe(0);
    expect(stats.availableToBorrowUSD).toBe(0);
    expect(stats.healthFactor).toBe(Infinity);
    expect(stats.liquidationRiskPct).toBe(0);
  });

  it("values collateral at price × balance / decimals", () => {
    // 1 PCOL @ $100 = $100 collateral
    const stats = computeUserAccountStats(
      makeAccountInput({ pcolBalance: 10n ** 18n }),
    );
    expect(stats.collateralValueUSD).toBeCloseTo(100, 4);
    expect(stats.borrowCapacityUSD).toBeCloseTo(75, 4); // 75% bcf
    expect(stats.liquidationThresholdUSD).toBeCloseTo(85, 4); // 85% lcf
    expect(stats.healthFactor).toBe(Infinity); // no borrow
  });

  it("computes health = liquidationThreshold / borrow when borrow > 0", () => {
    // 1 PCOL @ $100 collat, 50 wUSDC @ $1 borrow
    // liqThresh = 100 × 0.85 = 85
    // borrowVal = 50
    // health = 85 / 50 = 1.7
    const stats = computeUserAccountStats(
      makeAccountInput({
        pcolBalance: 10n ** 18n,
        borrowBase: 50n * 10n ** 6n, // 50 wUSDC (6-decimal)
      }),
    );
    expect(stats.borrowValueUSD).toBeCloseTo(50, 4);
    expect(stats.healthFactor).toBeCloseTo(1.7, 4);
    expect(stats.liquidationRiskPct).toBeCloseTo(50 / 85, 4);
    // Available to borrow = bcf-capacity − borrow = 75 − 50 = 25
    expect(stats.availableToBorrowUSD).toBeCloseTo(25, 4);
  });

  it("flags under-water positions (riskPct > 1, health < 1)", () => {
    // 1 PCOL @ $100, 90 wUSDC borrow → liqThresh 85 < borrow 90
    const stats = computeUserAccountStats(
      makeAccountInput({
        pcolBalance: 10n ** 18n,
        borrowBase: 90n * 10n ** 6n,
      }),
    );
    expect(stats.healthFactor).toBeLessThan(1);
    expect(stats.liquidationRiskPct).toBeGreaterThan(1);
  });

  it("clamps availableToBorrowUSD at 0 when borrow already exceeds capacity", () => {
    const stats = computeUserAccountStats(
      makeAccountInput({
        pcolBalance: 10n ** 18n,
        borrowBase: 80n * 10n ** 6n, // borrow > 75 bcf-capacity
      }),
    );
    expect(stats.availableToBorrowUSD).toBe(0);
  });

  it("denominates base supply value in USD using base price feed", () => {
    // 100 wUSDC supplied @ $1 = $100
    const stats = computeUserAccountStats(
      makeAccountInput({ supplyBase: 100n * 10n ** 6n }),
    );
    expect(stats.baseSupplyValueUSD).toBeCloseTo(100, 4);
  });
});

describe("computeProtocolStats", () => {
  it("zero-everything when the market is empty", () => {
    const input: ProtocolStatsInput = {
      totalSupplyBase: 0n,
      totalBorrowBase: 0n,
      baseDecimals: 6,
      basePriceUSDx8: PRICE_SCALE,
      utilizationScaled: 0n,
      supplyRatePerSecondScaled: 0n,
      borrowRatePerSecondScaled: 0n,
    };
    const stats = computeProtocolStats(input);
    expect(stats.tvlUSD).toBe(0);
    expect(stats.totalBorrowUSD).toBe(0);
    expect(stats.utilizationPct).toBe(0);
    expect(stats.supplyApyPct).toBe(0);
    expect(stats.borrowApyPct).toBe(0);
  });

  it("denominates TVL and total borrow at base-price USD value", () => {
    // 1000 wUSDC supplied, 400 wUSDC borrowed, $1 base price
    const input: ProtocolStatsInput = {
      totalSupplyBase: 1000n * 10n ** 6n,
      totalBorrowBase: 400n * 10n ** 6n,
      baseDecimals: 6,
      basePriceUSDx8: PRICE_SCALE,
      utilizationScaled: (FACTOR_SCALE * 4n) / 10n, // 0.4
      supplyRatePerSecondScaled: BigInt(Math.round(3.155e-10 * 1e18)),
      borrowRatePerSecondScaled: BigInt(Math.round(1.547e-9 * 1e18)),
    };
    const stats = computeProtocolStats(input);
    expect(stats.tvlUSD).toBeCloseTo(1000, 4);
    expect(stats.totalBorrowUSD).toBeCloseTo(400, 4);
    expect(stats.utilizationPct).toBeCloseTo(0.4, 6);
    expect(stats.supplyApyPct).toBeGreaterThan(0.0098);
    expect(stats.supplyApyPct).toBeLessThan(0.0102);
    expect(stats.borrowApyPct).toBeGreaterThan(0.0499);
    expect(stats.borrowApyPct).toBeLessThan(0.0501);
  });

  it("scales TVL when the base price is not $1 (e.g. wETH base)", () => {
    // 5 wETH supplied @ $4000/wETH = $20000
    const input: ProtocolStatsInput = {
      totalSupplyBase: 5n * 10n ** 18n,
      totalBorrowBase: 0n,
      baseDecimals: 18,
      basePriceUSDx8: 4000n * PRICE_SCALE,
      utilizationScaled: 0n,
      supplyRatePerSecondScaled: 0n,
      borrowRatePerSecondScaled: 0n,
    };
    const stats = computeProtocolStats(input);
    expect(stats.tvlUSD).toBeCloseTo(20000, 1);
  });
});
