import { describe, it, expect } from "vitest";
import { buildSolanaReadsAndStats, type SolanaAssetResolved } from "../mapSolanaPosition";

const BASE_PRICE = 100_000_000n; // 1e8 = $1 (wUSDC)
const SOL_PRICE = 16_000_000_000n; // $160 at 1e8

function base(over: Partial<SolanaAssetResolved> = {}): SolanaAssetResolved {
  return {
    symbol: "wUSDC", address: "0xbase", decimals: 6, isBase: true,
    priceUSDx8: BASE_PRICE, walletRaw: 0n, suppliedRaw: 0n, borrowedRaw: 0n,
    borrowCollateralFactorE18: 0n, supplyApyPct: 0, borrowApyPct: 0, ...over,
  };
}
function collat(over: Partial<SolanaAssetResolved> = {}): SolanaAssetResolved {
  return {
    symbol: "wSOL", address: "0xsol", decimals: 9, isBase: false,
    priceUSDx8: SOL_PRICE, walletRaw: 0n, suppliedRaw: 0n, borrowedRaw: 0n,
    borrowCollateralFactorE18: 800_000_000_000_000_000n /* 0.8 */, supplyApyPct: 0, borrowApyPct: 0, ...over,
  };
}

describe("buildSolanaReadsAndStats", () => {
  it("passes through SolanaAssetRead fields (no capacity/health when empty)", () => {
    const { reads, borrowCapacityUSD, healthFactor } = buildSolanaReadsAndStats([base(), collat()]);
    expect(reads).toHaveLength(2);
    expect(reads[0]).toMatchObject({ symbol: "wUSDC", isBase: true, decimals: 6 });
    expect(reads[1]).toMatchObject({ symbol: "wSOL", isBase: false, decimals: 9 });
    expect(borrowCapacityUSD).toBe(0);
    expect(healthFactor).toBeNull(); // no debt
  });

  it("computes capacity = Σ(collateralUSD × borrowCollateralFactor), base excluded", () => {
    // 10 wSOL @ $160 = $1600 collateral × 0.8 factor = $1280 capacity
    const { borrowCapacityUSD } = buildSolanaReadsAndStats([
      base(),
      collat({ suppliedRaw: 10_000_000_000n /* 10 wSOL, 9dp */ }),
    ]);
    expect(borrowCapacityUSD).toBeCloseTo(1280, 2);
  });

  it("derives healthFactor = capacity / borrowed when there is debt", () => {
    // capacity $1280, borrowed 640 wUSDC ($640) → HF = 2.0
    const { healthFactor } = buildSolanaReadsAndStats([
      base({ borrowedRaw: 640_000_000n /* 640 USDC, 6dp */ }),
      collat({ suppliedRaw: 10_000_000_000n }),
    ]);
    expect(healthFactor).toBeCloseTo(2.0, 3);
  });

  it("healthFactor is null when there is collateral but no debt", () => {
    const { healthFactor } = buildSolanaReadsAndStats([
      base(),
      collat({ suppliedRaw: 10_000_000_000n }),
    ]);
    expect(healthFactor).toBeNull();
  });

  it("base borrowedRaw drives borrowed; collateral borrowedRaw ignored", () => {
    // a collateral with a nonzero borrowedRaw must NOT count as debt
    const { healthFactor, borrowCapacityUSD } = buildSolanaReadsAndStats([
      base(),
      collat({ suppliedRaw: 10_000_000_000n, borrowedRaw: 999_000_000n }),
    ]);
    expect(borrowCapacityUSD).toBeCloseTo(1280, 2);
    expect(healthFactor).toBeNull(); // base has no debt → no health
  });

  it("a zero-price (unresolved feed) collateral contributes 0 capacity, not NaN", () => {
    const { borrowCapacityUSD } = buildSolanaReadsAndStats([
      base(),
      collat({ suppliedRaw: 10_000_000_000n, priceUSDx8: 0n }),
    ]);
    expect(borrowCapacityUSD).toBe(0);
    expect(Number.isNaN(borrowCapacityUSD)).toBe(false);
  });

  it("limits.availableLiquidityUsd is capped by the PHYSICAL base balance, not the accounting net", () => {
    // Live deficit (Hadrian comet 2026-06-07): net = 11.000499 − 0.500163 =
    // 10.500336 wUSDC, but only 9.083284 physically held → the real ceiling.
    const { limits } = buildSolanaReadsAndStats([base(), collat({ suppliedRaw: 10_000_000_000n })], {
      totalSupplyBaseRaw: 11_000_499n,
      totalBorrowBaseRaw: 500_163n,
      baseBorrowMinRaw: 0n,
      baseBalanceRaw: 9_083_284n,
      baseDecimals: 6,
      basePriceUSDx8: BASE_PRICE,
    });
    expect(limits).toBeDefined();
    // 9.083284 × $1, not 10.500336 (which reverts on-chain).
    expect(limits!.availableLiquidityUsd).toBeCloseTo(9.083284, 6);
  });

  it("limits falls back to the accounting net when the physical balance is unknown (null)", () => {
    const { limits } = buildSolanaReadsAndStats([base()], {
      totalSupplyBaseRaw: 11_000_499n,
      totalBorrowBaseRaw: 500_163n,
      baseBorrowMinRaw: 0n,
      baseBalanceRaw: null,
      baseDecimals: 6,
      basePriceUSDx8: BASE_PRICE,
    });
    expect(limits!.availableLiquidityUsd).toBeCloseTo(10.500336, 6);
  });
});
