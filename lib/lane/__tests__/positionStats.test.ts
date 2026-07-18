import { describe, it, expect } from "vitest";
import { computePositionStats, HEALTH_FACTOR_NO_DEBT } from "../positionStats";
import type { LaneAsset } from "@/components/aerarium/lane/types";

// Minimal LaneAsset fixture — only the fields computePositionStats reads matter
// (the balances, collateral flag, supplyApy/borrowApy, suppliedTokens, priceKnown).
const asset = (over: Partial<LaneAsset> = {}): LaneAsset => ({
  sym: "X",
  name: "X",
  supplyApy: 0,
  borrowApy: 0,
  borrowable: false,
  walletBal: 0,
  suppliedBal: 0,
  borrowedBal: 0,
  walletTokens: 0,
  suppliedTokens: 0,
  borrowedTokens: 0,
  priceUsd: 1,
  priceKnown: true,
  collateral: true,
  borrowCollateralFactor: 0.8,
  ...over,
});

describe("computePositionStats — one shared position-total calc for both lanes", () => {
  it("derives supplied/borrowed by summing the per-asset USD balances", () => {
    const assets = [
      asset({ sym: "wUSDC", collateral: false, borrowable: true, borrowedBal: 1200, borrowedTokens: 1200 }),
      asset({ sym: "wETH", suppliedBal: 6000, suppliedTokens: 2 }),
      asset({ sym: "wSOL", suppliedBal: 0 }),
    ];
    const s = computePositionStats(assets, { capacityUsd: 4800, healthFactor: 4.25 });
    expect(s.supplied).toBeCloseTo(6000, 6); // total = Σ suppliedBal (= sum of the visible rows)
    expect(s.borrowed).toBeCloseTo(1200, 6);
  });

  it("passes capacity through unchanged and clamps a finite health factor", () => {
    const s = computePositionStats([], { capacityUsd: 4800, healthFactor: 4.25 });
    expect(s.capacity).toBe(4800);
    expect(s.healthFactor).toBeCloseTo(4.25, 6);
  });

  it("maps Infinity and null health to the no-debt sentinel", () => {
    expect(computePositionStats([], { capacityUsd: 0, healthFactor: Infinity }).healthFactor).toBe(
      HEALTH_FACTOR_NO_DEBT,
    );
    expect(computePositionStats([], { capacityUsd: 0, healthFactor: null }).healthFactor).toBe(
      HEALTH_FACTOR_NO_DEBT,
    );
  });

  it("rolls net APR up from the assets (supply-weighted minus borrow-weighted)", () => {
    const assets = [
      asset({ sym: "wUSDC", collateral: false, borrowable: true, borrowedBal: 1000, borrowApy: 8 }),
      asset({ sym: "wETH", suppliedBal: 2000, supplyApy: 0 }),
    ];
    // pays 8% on 1000 = 80; earns 0; supplied total 2000 → net = -80/2000*100 = -4%
    const s = computePositionStats(assets, { capacityUsd: 0, healthFactor: null });
    expect(s.netApr).toBeCloseTo(-4, 6);
  });

  describe("pricesStale ⇔ a HELD collateral has an unknown price", () => {
    it("flips true when a held collateral's feed is stale", () => {
      const assets = [
        asset({ sym: "wUSDC", collateral: false }),
        asset({ sym: "wJUP", suppliedTokens: 5, priceKnown: false }),
      ];
      expect(computePositionStats(assets, { capacityUsd: 0, healthFactor: null }).pricesStale).toBe(true);
    });
    it("stays false for an UNHELD stale collateral (suppliedTokens 0)", () => {
      const assets = [asset({ sym: "wJUP", suppliedTokens: 0, priceKnown: false })];
      expect(computePositionStats(assets, { capacityUsd: 0, healthFactor: null }).pricesStale).toBe(false);
    });
    it("stays false when a held collateral's price is known", () => {
      const assets = [asset({ sym: "wETH", suppliedTokens: 2, priceKnown: true })];
      expect(computePositionStats(assets, { capacityUsd: 0, healthFactor: null }).pricesStale).toBe(false);
    });
    it("ignores a stale BASE feed — only collaterals flip the flag", () => {
      const assets = [asset({ sym: "wUSDC", collateral: false, suppliedTokens: 100, priceKnown: false })];
      expect(computePositionStats(assets, { capacityUsd: 0, healthFactor: null }).pricesStale).toBe(false);
    });
  });

  it("empty position → zero totals, capacity from input, not stale", () => {
    const s = computePositionStats([], { capacityUsd: 0, healthFactor: null });
    expect(s.supplied).toBe(0);
    expect(s.borrowed).toBe(0);
    expect(s.capacity).toBe(0);
    expect(s.pricesStale).toBe(false);
  });
});
