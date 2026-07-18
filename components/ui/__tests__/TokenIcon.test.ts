// Failing tests for token icon color mapping (P2).
// Fails today because components/ui/TokenIcon.tsx does not exist.

import { describe, it, expect } from "vitest";
import { getTokenIconStyle } from "../tokenColors";

describe("getTokenIconStyle", () => {
  it("returns the canonical wUSDC color (USDC blue)", () => {
    const s = getTokenIconStyle("wUSDC");
    expect(s.background).toMatch(/^#2775ca/i);
    expect(s.letter).toBe("U");
  });

  it("treats USDC and wUSDC as the same color (wrapper sameness)", () => {
    expect(getTokenIconStyle("USDC").background).toBe(getTokenIconStyle("wUSDC").background);
  });

  it("returns Rome-purple variants for testnet collateral tokens", () => {
    const pcol = getTokenIconStyle("PCOL");
    const mock = getTokenIconStyle("MOCK");
    const gold = getTokenIconStyle("GOLD");
    expect(pcol.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(mock.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(gold.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(pcol.background).not.toBe(mock.background);
    expect(pcol.background).not.toBe(gold.background);
    expect(pcol.letter).toBe("P");
    expect(mock.letter).toBe("M");
    expect(gold.letter).toBe("G");
  });

  it("falls back to a deterministic neutral for unknown symbols", () => {
    const a = getTokenIconStyle("UNKNOWN_XYZ");
    const b = getTokenIconStyle("UNKNOWN_XYZ");
    expect(a.background).toBe(b.background); // deterministic
    expect(a.letter).toBe("U"); // first letter
  });
});
