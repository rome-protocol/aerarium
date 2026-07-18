import { describe, it, expect } from "vitest";
import { fmtBalance } from "../primitives";

// fmtBalance renders a balance cell honestly:
//  - price KNOWN  → USD ("$X"), or "—" when the USD value is 0
//  - price UNKNOWN (feed stale/reverting) → the TOKEN amount ("1.001 wBTC")
//    so supplied collateral never silently disappears just because its price
//    feed is stale. "—" only when there's genuinely nothing to show.
describe("fmtBalance", () => {
  it("shows USD when the price is known and the value is positive", () => {
    expect(fmtBalance(302.65, 302.65, "wUSDC", true)).toBe("$302.65");
  });

  it("shows an em-dash when the price is known but the value is zero", () => {
    expect(fmtBalance(0, 0, "wETH", true)).toBe("—");
  });

  it("shows the TOKEN amount when the price is unknown but a balance exists", () => {
    // The bug: 1.001 wBTC supplied rendered "—" because USD was $0 (stale feed).
    expect(fmtBalance(0, 1.001, "wBTC", false)).toBe("1.001 wBTC");
  });

  it("formats large token amounts with locale grouping", () => {
    expect(fmtBalance(0, 1234567, "wBONK", false)).toBe("1,234,567 wBONK");
  });

  it("shows an em-dash when the price is unknown AND there is no balance", () => {
    expect(fmtBalance(0, 0, "wJUP", false)).toBe("—");
  });

  it("trims token amounts to 6 significant decimals, no trailing zeros", () => {
    expect(fmtBalance(0, 0.5, "wSOL", false)).toBe("0.5 wSOL");
  });
});
