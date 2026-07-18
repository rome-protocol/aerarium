// Failing tests for action preview compute (P3).
// computeActionPreview(currentStats, action, input) returns the
// post-action snapshot for the modal's "will become" display.

import { describe, it, expect } from "vitest";
import {
  computeActionPreview,
  type ActionPreviewInput,
  type ActionPreview,
} from "../stats";

const ZERO_STATE: ActionPreviewInput = {
  baseDecimals: 6,
  basePriceUSDx8: 100_000_000n, // $1
  walletBaseBalance: 1_000n * 10n ** 6n,
  baseSupplyBalance: 0n,
  baseBorrowBalance: 0n,
  collateralValueUSD: 0,
  borrowCapacityUSD: 0,
  liquidationThresholdUSD: 0,
  collateralByAsset: {},
};

describe("computeActionPreview — supply", () => {
  it("supply reduces wallet, increases base supply, health unchanged at ∞", () => {
    const out = computeActionPreview(ZERO_STATE, {
      kind: "supply",
      asset: "base",
      amount: 100n * 10n ** 6n,
    });
    expect(out.walletBaseAfter).toBe(900n * 10n ** 6n);
    expect(out.baseSupplyAfter).toBe(100n * 10n ** 6n);
    expect(out.baseBorrowAfter).toBe(0n);
    expect(out.healthFactorAfter).toBe(Infinity);
  });

  it("supplyCollateral increases collat value, raises borrow capacity", () => {
    const start: ActionPreviewInput = {
      ...ZERO_STATE,
      collateralByAsset: {
        PCOL: {
          symbol: "PCOL",
          decimals: 18,
          balance: 0n,
          priceUSDx8: 100n * 100_000_000n, // $100 per PCOL
          borrowCollateralFactor: (10n ** 18n * 75n) / 100n,
          liquidateCollateralFactor: (10n ** 18n * 85n) / 100n,
          walletBalance: 10n ** 18n,
        },
      },
    };
    const out = computeActionPreview(start, {
      kind: "supplyCollateral",
      asset: "PCOL",
      amount: 10n ** 18n, // 1 PCOL
    });
    expect(out.collateralValueAfterUSD).toBeCloseTo(100, 4);
    expect(out.borrowCapacityAfterUSD).toBeCloseTo(75, 4);
    expect(out.liquidationThresholdAfterUSD).toBeCloseTo(85, 4);
  });
});

describe("computeActionPreview — withdraw", () => {
  it("withdraw reduces base supply, increases wallet", () => {
    const start: ActionPreviewInput = {
      ...ZERO_STATE,
      walletBaseBalance: 0n,
      baseSupplyBalance: 200n * 10n ** 6n,
    };
    const out = computeActionPreview(start, {
      kind: "withdraw",
      asset: "base",
      amount: 50n * 10n ** 6n,
    });
    expect(out.walletBaseAfter).toBe(50n * 10n ** 6n);
    expect(out.baseSupplyAfter).toBe(150n * 10n ** 6n);
  });

  it("withdraw past supply triggers borrow (Compound v3 semantics)", () => {
    // Withdraw 100 from 60 supply → 60 supply burned + 40 new borrow
    const start: ActionPreviewInput = {
      ...ZERO_STATE,
      walletBaseBalance: 0n,
      baseSupplyBalance: 60n * 10n ** 6n,
      // pretend there's some collateral so the borrow is admissible
      collateralValueUSD: 100,
      borrowCapacityUSD: 75,
      liquidationThresholdUSD: 85,
    };
    const out = computeActionPreview(start, {
      kind: "withdraw",
      asset: "base",
      amount: 100n * 10n ** 6n,
    });
    expect(out.baseSupplyAfter).toBe(0n);
    expect(out.baseBorrowAfter).toBe(40n * 10n ** 6n);
    expect(out.walletBaseAfter).toBe(100n * 10n ** 6n);
  });
});

describe("computeActionPreview — leverageOpen", () => {
  it("supplies collat + borrows base atomically", () => {
    const start: ActionPreviewInput = {
      ...ZERO_STATE,
      collateralByAsset: {
        PCOL: {
          symbol: "PCOL",
          decimals: 18,
          balance: 0n,
          priceUSDx8: 100n * 100_000_000n,
          borrowCollateralFactor: (10n ** 18n * 75n) / 100n,
          liquidateCollateralFactor: (10n ** 18n * 85n) / 100n,
          walletBalance: 10n * 10n ** 18n,
        },
      },
    };
    const out = computeActionPreview(start, {
      kind: "leverageOpen",
      collateralAsset: "PCOL",
      collateralAmount: 10n ** 18n, // 1 PCOL = $100 collat
      borrowAmount: 50n * 10n ** 6n, // borrow 50 wUSDC
    });
    expect(out.collateralValueAfterUSD).toBeCloseTo(100, 4);
    expect(out.baseBorrowAfter).toBe(50n * 10n ** 6n);
    // health = liqThresh(85) / borrow(50) = 1.7
    expect(out.healthFactorAfter).toBeCloseTo(1.7, 4);
  });

  it("returns Infinity health when leverage opens with zero borrow (edge case)", () => {
    const start: ActionPreviewInput = {
      ...ZERO_STATE,
      collateralByAsset: {
        PCOL: {
          symbol: "PCOL",
          decimals: 18,
          balance: 0n,
          priceUSDx8: 100n * 100_000_000n,
          borrowCollateralFactor: (10n ** 18n * 75n) / 100n,
          liquidateCollateralFactor: (10n ** 18n * 85n) / 100n,
          walletBalance: 10n ** 18n,
        },
      },
    };
    const out = computeActionPreview(start, {
      kind: "leverageOpen",
      collateralAsset: "PCOL",
      collateralAmount: 10n ** 18n,
      borrowAmount: 0n,
    });
    expect(out.healthFactorAfter).toBe(Infinity);
  });
});

describe("computeActionPreview — hint string", () => {
  it("includes 'Will reduce health to' for any leverage that creates debt", () => {
    const start: ActionPreviewInput = {
      ...ZERO_STATE,
      collateralByAsset: {
        PCOL: {
          symbol: "PCOL",
          decimals: 18,
          balance: 0n,
          priceUSDx8: 100n * 100_000_000n,
          borrowCollateralFactor: (10n ** 18n * 75n) / 100n,
          liquidateCollateralFactor: (10n ** 18n * 85n) / 100n,
          walletBalance: 10n ** 18n,
        },
      },
    };
    const out = computeActionPreview(start, {
      kind: "leverageOpen",
      collateralAsset: "PCOL",
      collateralAmount: 10n ** 18n,
      borrowAmount: 50n * 10n ** 6n,
    });
    expect(out.hint).toMatch(/reduce health to/i);
    expect(out.hint).toMatch(/1\.7/);
  });

  it("returns 'No health change' for base supply (base isn't collateral)", () => {
    const out = computeActionPreview(ZERO_STATE, {
      kind: "supply",
      asset: "base",
      amount: 100n * 10n ** 6n,
    });
    expect(out.hint).toMatch(/no health change/i);
  });
});
