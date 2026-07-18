import { describe, it, expect } from "vitest";
import { mapPoolNumbers, mapMarketRows } from "../onchain";
import type { ReserveReads } from "../../portal/reads";
import type { CometAssetSymbol } from "../../lane/cometAssetSymbols";

const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;

const reserves: ReserveReads = {
  totalSupply: 1_000_000n, // 1.0 wUSDC (6dp)
  totalBorrow: 500_000n, // 0.5 wUSDC
  utilization: 500_000_000_000_000_000n, // 0.5e18 = 50%
  basePrice: 100_000_000n, // $1.00 @ 1e8
  supplyRate: 1_000_000_000n, // per-second, 1e18-scaled
  borrowRate: 2_000_000_000n,
  collats: [
    { supplyRaw: 2_000_000_000n, priceX8: 16_000_000_000n }, // 2.0 wSOL (9dp) @ $160 = $320
  ],
  baseBalanceRaw: 500_000n, // physical base held (= net here; no deficit in this fixture)
};

const ordered: CometAssetSymbol[] = [
  { address: "0xbase" as `0x${string}`, symbol: "wUSDC", decimals: 6, isBase: true },
  { address: "0xsol" as `0x${string}`, symbol: "wSOL", decimals: 9, isBase: false },
];

describe("mapPoolNumbers", () => {
  it("derives USD totals, APRs and utilization% from reserve reads", () => {
    const p = mapPoolNumbers(reserves, 6);
    expect(p.totalSuppliedUsd).toBeCloseTo(1.0, 6);
    expect(p.totalBorrowedUsd).toBeCloseTo(0.5, 6);
    expect(p.utilizationPct).toBeCloseTo(50, 6);
    expect(p.supplyAprPct).toBeCloseTo((1e9 / 1e18) * SECONDS_PER_YEAR * 100, 6);
    expect(p.borrowAprPct).toBeCloseTo((2e9 / 1e18) * SECONDS_PER_YEAR * 100, 6);
  });
});

describe("mapMarketRows", () => {
  // 0.8e18 = 80% borrow collateral factor for the one collateral (wSOL).
  const collatFactorsE18 = [800_000_000_000_000_000n];

  it("emits a base row (APR/util from pool) + one collateral row (size in USD)", () => {
    const pool = mapPoolNumbers(reserves, 6);
    const rows = mapMarketRows(reserves, ordered, pool, collatFactorsE18);
    expect(rows).toHaveLength(2);

    const base = rows[0];
    expect(base).toMatchObject({ asset: "wUSDC", kind: "base", chains: ["evm", "sol"] });
    expect(base.total).toBeCloseTo(1.0, 6); // base market size = supplied
    expect(base.supplyApy).toBeCloseTo(pool.supplyAprPct, 6);
    expect(base.util).toBeCloseTo(50, 6);
    expect(base.collateralFactorPct).toBeUndefined(); // base isn't a collateral

    const collat = rows[1];
    expect(collat).toMatchObject({ asset: "wSOL", kind: "collateral", supplyApy: 0, borrowApy: 0 });
    expect(collat.total).toBeCloseTo(320, 4); // 2 wSOL × $160
    expect(collat.collateralFactorPct).toBeCloseTo(80, 6); // 0.8e18 → 80% max LTV
  });
});
