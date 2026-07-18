import { describe, it, expect } from "vitest";
import { cappedBaseLiquidityRaw } from "../availableLiquidity";

// The base liquidity a Comet can actually pay out for a withdraw / borrow is the
// MIN of two things:
//   - accounting net      = totalSupply − totalBorrow  (what suppliers net-supplied)
//   - physical balance    = baseToken.balanceOf(comet) (what the contract HOLDS)
// On a healthy Comet these are equal. When the Comet runs a base DEFICIT (negative
// reserves) the physical balance is LOWER, and that — not the accounting net — is
// the real ceiling. Live root cause (Hadrian comet, 2026-06-07): net 10.500336 but
// only 9.083284 wUSDC held → withdrawing/borrowing the accounting net reverts.
describe("cappedBaseLiquidityRaw — min(accounting net, physical base balance)", () => {
  it("DEFICIT: physical < net → caps at the physical balance (the live revert case)", () => {
    // totalSupply 11.000499, totalBorrow 0.500163 (6dp) → net 10.500336;
    // comet physically holds 9.083284 → the real ceiling.
    expect(cappedBaseLiquidityRaw(11_000_499n, 500_163n, 9_083_284n)).toBe(9_083_284n);
  });

  it("HEALTHY: physical == net → returns net (no behaviour change)", () => {
    expect(cappedBaseLiquidityRaw(10_000_000n, 2_000_000n, 8_000_000n)).toBe(8_000_000n);
  });

  it("RESERVES SURPLUS: physical > net → returns net (can't withdraw protocol reserves)", () => {
    // net = 8.0; comet holds 10.0 (2.0 reserves) → still only 8.0 is suppliers'.
    expect(cappedBaseLiquidityRaw(10_000_000n, 2_000_000n, 10_000_000n)).toBe(8_000_000n);
  });

  it("net floored at 0 when totalBorrow ≥ totalSupply (never negative)", () => {
    expect(cappedBaseLiquidityRaw(2_000_000n, 5_000_000n, 9_000_000n)).toBe(0n);
  });

  it("physical UNKNOWN (read failed → null) → falls back to net, never blocks the user", () => {
    // A transient balanceOf failure must NOT zero out liquidity (that would block
    // every borrow/withdraw). Unknown physical → trust the accounting net.
    expect(cappedBaseLiquidityRaw(11_000_499n, 500_163n, null)).toBe(10_500_336n);
  });

  it("empty pool: physical 0 (legit) → 0 (correctly no liquidity)", () => {
    expect(cappedBaseLiquidityRaw(0n, 0n, 0n)).toBe(0n);
  });
});
