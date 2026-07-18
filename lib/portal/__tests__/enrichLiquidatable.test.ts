import { describe, it, expect } from "vitest";
import { buildLiquidatableInfo, type LiquidatableRawReads } from "../enrichLiquidatable";

const ACC = "0x1111111111111111111111111111111111111111" as `0x${string}`;

// Scale constants (mirror Compound's): prices 1e8, factors 1e18.
const px = (usd: number) => BigInt(Math.round(usd * 1e8)); // 1e8-scaled USD price
const factor = (f: number) => BigInt(Math.round(f * 1e18)); // 1e18-scaled 0..1 factor

describe("buildLiquidatableInfo — raw comet reads → LiquidatableInfo", () => {
  it("converts base debt to USD using the 8-dp base price", () => {
    // 500 base units at 6 decimals (e.g. wUSDC) × $1 = $500 debt.
    const info = buildLiquidatableInfo({
      address: ACC,
      borrowBalanceBase: 500_000_000n, // 500 × 1e6
      baseDecimals: 6,
      basePriceUSDx8: px(1),
      collaterals: [],
    });
    expect(info.debtUsd).toBeCloseTo(500, 6);
    // No collateral → zero collateral USD, zero bonus.
    expect(info.collateralUsd).toBe(0);
    expect(info.bonusPct).toBe(0);
  });

  it("converts collateral balances to USD respecting per-asset decimals/scale", () => {
    // 2 wETH (18-dp) @ $2000 = $4000 ; 100 wUSDC (6-dp) @ $1 = $100.
    const info = buildLiquidatableInfo({
      address: ACC,
      borrowBalanceBase: 0n,
      baseDecimals: 6,
      basePriceUSDx8: px(1),
      collaterals: [
        { balance: 2_000_000_000_000_000_000n, decimals: 18, priceUSDx8: px(2000), liquidationFactor: factor(0.9) },
        { balance: 100_000_000n, decimals: 6, priceUSDx8: px(1), liquidationFactor: factor(0.95) },
      ],
    });
    expect(info.collateralUsd).toBeCloseTo(4100, 4);
  });

  it("derives the liquidation bonus from (1 - liquidationFactor), USD-weighted across held collaterals", () => {
    // Two collats:
    //   A: $4000 @ liquidationFactor 0.90 → discount 10%
    //   B: $1000 @ liquidationFactor 0.95 → discount 5%
    // USD-weighted: (4000*10 + 1000*5) / 5000 = 9% (45000/5000).
    const info = buildLiquidatableInfo({
      address: ACC,
      borrowBalanceBase: 0n,
      baseDecimals: 6,
      basePriceUSDx8: px(1),
      collaterals: [
        { balance: 2_000_000_000_000_000_000n, decimals: 18, priceUSDx8: px(2000), liquidationFactor: factor(0.9) },
        { balance: 1_000_000_000n, decimals: 6, priceUSDx8: px(1), liquidationFactor: factor(0.95) },
      ],
    });
    expect(info.bonusPct).toBeCloseTo(9, 4);
  });

  it("computes a health factor from liquidation-weighted collateral vs debt (< 1 when underwater)", () => {
    // Collateral seizable-value-weighted: $4000 @ LF 0.90 → liq threshold $3600.
    // Debt $4000 → HF = 3600 / 4000 = 0.9 (< 1, liquidatable).
    const info = buildLiquidatableInfo({
      address: ACC,
      borrowBalanceBase: 4_000_000_000n, // 4000 × 1e6
      baseDecimals: 6,
      basePriceUSDx8: px(1),
      collaterals: [
        { balance: 2_000_000_000_000_000_000n, decimals: 18, priceUSDx8: px(2000), liquidationFactor: factor(0.9) },
      ],
    });
    expect(info.healthFactor).not.toBeNull();
    expect(info.healthFactor!).toBeCloseTo(0.9, 4);
    expect(info.healthFactor!).toBeLessThan(1);
  });

  it("null health factor when there is no debt (cannot divide)", () => {
    const info = buildLiquidatableInfo({
      address: ACC,
      borrowBalanceBase: 0n,
      baseDecimals: 6,
      basePriceUSDx8: px(1),
      collaterals: [
        { balance: 1_000_000_000_000_000_000n, decimals: 18, priceUSDx8: px(2000), liquidationFactor: factor(0.9) },
      ],
    });
    expect(info.healthFactor).toBeNull();
  });

  it("an empty / zero account yields zeros, never NaN", () => {
    const info = buildLiquidatableInfo({
      address: ACC,
      borrowBalanceBase: 0n,
      baseDecimals: 6,
      basePriceUSDx8: 0n,
      collaterals: [
        // Zero-balance collateral must not pollute the weighted bonus with NaN.
        { balance: 0n, decimals: 18, priceUSDx8: px(2000), liquidationFactor: factor(0.9) },
      ],
    });
    expect(info.debtUsd).toBe(0);
    expect(info.collateralUsd).toBe(0);
    expect(info.bonusPct).toBe(0);
    expect(info.healthFactor).toBeNull();
    expect(Number.isNaN(info.bonusPct)).toBe(false);
    expect(Number.isNaN(info.debtUsd)).toBe(false);
    expect(Number.isNaN(info.collateralUsd)).toBe(false);
  });

  it("carries the account address through", () => {
    const info = buildLiquidatableInfo({
      address: ACC,
      borrowBalanceBase: 0n,
      baseDecimals: 6,
      basePriceUSDx8: px(1),
      collaterals: [],
    });
    expect(info.address).toBe(ACC);
  });

  it("falls back to the single held collateral's discount when only one collateral has value", () => {
    // Only collateral B holds a balance → bonus = its discount (5%), not blended
    // with the zero-balance A.
    const info = buildLiquidatableInfo({
      address: ACC,
      borrowBalanceBase: 0n,
      baseDecimals: 6,
      basePriceUSDx8: px(1),
      collaterals: [
        { balance: 0n, decimals: 18, priceUSDx8: px(2000), liquidationFactor: factor(0.9) },
        { balance: 1_000_000_000n, decimals: 6, priceUSDx8: px(1), liquidationFactor: factor(0.95) },
      ],
    });
    expect(info.bonusPct).toBeCloseTo(5, 4);
  });
});

// Shape guard so the raw-reads contract stays explicit for both lanes.
describe("LiquidatableRawReads shape", () => {
  it("accepts the documented fields", () => {
    const reads: LiquidatableRawReads = {
      address: ACC,
      borrowBalanceBase: 0n,
      baseDecimals: 6,
      basePriceUSDx8: 0n,
      collaterals: [],
    };
    expect(reads.address).toBe(ACC);
  });
});
