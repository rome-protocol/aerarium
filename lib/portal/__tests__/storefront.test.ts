import { describe, it, expect } from "vitest";
import { buildStorefront } from "../storefront";
import type { Address } from "viem";

const A1 = "0x1111111111111111111111111111111111111111" as Address;
const A2 = "0x2222222222222222222222222222222222222222" as Address;

describe("buildStorefront — Compound v3 storefront 'for sale' logic", () => {
  it("is CLOSED (NotForSale) when reserves >= target — nothing for sale", () => {
    const s = buildStorefront(500n, 100n, [{ asset: A1, symbol: "wETH", reserves: 9n, decimals: 18 }]);
    expect(s.open).toBe(false);
    expect(s.items).toEqual([]);
  });

  it("is OPEN when reserves < target, and lists only collaterals the protocol actually holds", () => {
    const s = buildStorefront(10n, 100n, [
      { asset: A1, symbol: "wETH", reserves: 2_000000000000000000n, decimals: 18 }, // 2 wETH seized
      { asset: A2, symbol: "wBTC", reserves: 0n, decimals: 8 }, // none seized → filtered out
    ]);
    expect(s.open).toBe(true);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ asset: A1, symbol: "wETH", availableTokens: 2 });
  });

  it("treats a negative reserves int256 as below a positive target (open)", () => {
    const s = buildStorefront(-5n, 100n, [{ asset: A1, symbol: "wETH", reserves: 1_000000000000000000n, decimals: 18 }]);
    expect(s.open).toBe(true);
    expect(s.items).toHaveLength(1);
  });
});
