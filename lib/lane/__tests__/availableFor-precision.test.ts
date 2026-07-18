import { describe, it, expect } from "vitest";
import { availableFor, floorTokens } from "../laneActions";
import type { LaneAsset, LanePosition } from "@/components/aerarium/lane/types";

const asset = (over: Partial<LaneAsset>): LaneAsset => ({
  sym: "wUSDC", name: "USD Coin", supplyApy: 0, borrowApy: 0, borrowable: true,
  walletBal: 0, suppliedBal: 0, borrowedBal: 0,
  walletTokens: 0, suppliedTokens: 0, borrowedTokens: 0,
  priceUsd: 1, priceKnown: true, collateral: false, borrowCollateralFactor: 0,
  address: "0x0", displayAddress: "0x0", decimals: 6,
  ...over,
});

const position = (over: Partial<LanePosition>): LanePosition => ({
  supplied: 0, borrowed: 0, capacity: 0, healthFactor: 99, netApr: 0,
  pricesStale: false, assets: [], limits: undefined,
  ...over,
});

describe("availableFor — Max precision + protocol-boundary haircut", () => {
  it("borrow limited by liquidity: Max lands STRICTLY UNDER the on-chain liquidity (not the exact boundary that reverts)", () => {
    const r = availableFor({
      type: "borrow",
      asset: asset({ priceUsd: 1 }),
      position: position({ capacity: 1_000_000, borrowed: 0, limits: { availableLiquidityUsd: 10.5, baseBorrowMinUsd: 0 } }),
    });
    expect(r.binding).toBe("liquidity");
    expect(r.tokens).toBeLessThan(10.5); // was 10.5 exactly → "Simulation failed" on Max-borrow
    expect(r.tokens).toBeGreaterThan(10.5 * 0.99); // a SMALL safety haircut, not a big cut
  });

  it("borrow limited by capacity: Max < capacity headroom (leaves health > 1, not instantly liquidatable)", () => {
    const r = availableFor({
      type: "borrow",
      asset: asset({ priceUsd: 1 }),
      position: position({ capacity: 100, borrowed: 0, limits: { availableLiquidityUsd: Infinity, baseBorrowMinUsd: 0 } }),
    });
    expect(r.binding).toBe("capacity");
    expect(r.tokens).toBeLessThan(100);
  });

  it("supply limited by WALLET: no haircut — you can supply 100% of your own balance", () => {
    const r = availableFor({
      type: "supply",
      asset: asset({ priceUsd: 1, walletTokens: 100, walletBal: 100 }),
      position: position({}),
    });
    expect(r.binding).toBe("wallet");
    expect(r.tokens).toBe(100);
  });

  it("repay limited by DEBT: no haircut on your own debt", () => {
    const r = availableFor({
      type: "repay",
      asset: asset({ priceUsd: 1, borrowedTokens: 42, borrowedBal: 42, walletTokens: 1000, walletBal: 1000 }),
      position: position({ borrowed: 42 }),
    });
    expect(r.binding).toBe("debt");
    expect(r.tokens).toBe(42);
  });

  it("supply limited by WALLET keeps full precision (the Max FILL truncates, not availableFor)", () => {
    const r = availableFor({
      type: "supply",
      asset: asset({ priceUsd: 1, walletTokens: 100.1234569, walletBal: 100.1234569 }),
      position: position({}),
    });
    expect(r.binding).toBe("wallet");
    expect(r.tokens).toBeCloseTo(100.1234569, 7); // exact — no floor in availableFor
  });
});

describe("floorTokens — the Max-fill formatter", () => {
  it("TRUNCATES to 6dp (never rounds up past the true amount → no on-chain revert)", () => {
    expect(floorTokens(100.1234569)).toBe("100.123456"); // not 100.123457
  });
  it("emits a plain, separator-free string (no thousands commas that break parseFloat)", () => {
    expect(floorTokens(10500.5)).toBe("10500.5");
  });
  it("clamps non-positive / non-finite to '0'", () => {
    expect(floorTokens(0)).toBe("0");
    expect(floorTokens(-5)).toBe("0");
    expect(floorTokens(Infinity)).toBe("0");
  });
});
