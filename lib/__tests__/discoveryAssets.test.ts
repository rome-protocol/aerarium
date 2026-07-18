import { describe, it, expect } from "vitest";
import { discoveryAssets } from "../discoveryAssets";
import type { CompoundChainConfig } from "../registry/types";

// Minimal config fixture — only the fields discoveryAssets reads. Cast through
// unknown so we don't have to fill the whole CompoundChainConfig shape.
const cfg = {
  baseAsset: { address: "0xBA5e000000000000000000000000000000000000", displaySymbol: "wUSDC" },
  collateralAssets: {
    wETH: { symbol: "wETH", address: "0xE7H0000000000000000000000000000000000000", decimals: 8 },
    wSOL: { symbol: "wSOL", address: "0x5o10000000000000000000000000000000000000", decimals: 9 },
  },
} as unknown as CompoundChainConfig;

describe("discoveryAssets — derive the probe asset list from chain config", () => {
  it("returns base first, then collaterals (config-driven, no hardcoded addresses)", () => {
    const a = discoveryAssets(cfg);
    expect(a.map((x) => x.symbol)).toEqual(["wUSDC", "wETH", "wSOL"]);
    expect(a[0].address).toBe("0xBA5e000000000000000000000000000000000000");
  });

  it("derives amount = tokensPerAsset whole tokens scaled by each collateral's decimals", () => {
    const a = discoveryAssets(cfg, { tokensPerAsset: 1 });
    expect(a.find((x) => x.symbol === "wETH")!.amount).toBe(10n ** 8n); // 1 wETH @ 8dp
    expect(a.find((x) => x.symbol === "wSOL")!.amount).toBe(10n ** 9n); // 1 wSOL @ 9dp
  });

  it("defaults base decimals to 6 (USDC-convention; base config carries none) and is overridable", () => {
    expect(discoveryAssets(cfg)[0].amount).toBe(10n ** 6n); // 1 wUSDC @ 6dp default
    expect(discoveryAssets(cfg, { baseDecimals: 18 })[0].amount).toBe(10n ** 18n);
  });

  it("scales every asset by tokensPerAsset", () => {
    const a = discoveryAssets(cfg, { tokensPerAsset: 5 });
    expect(a.find((x) => x.symbol === "wETH")!.amount).toBe(5n * 10n ** 8n);
    expect(a[0].amount).toBe(5n * 10n ** 6n);
  });

  it("handles a chain with zero collaterals (base only)", () => {
    const baseOnly = {
      baseAsset: { address: "0xB", displaySymbol: "wUSDC" },
      collateralAssets: {},
    } as unknown as CompoundChainConfig;
    expect(discoveryAssets(baseOnly).map((x) => x.symbol)).toEqual(["wUSDC"]);
  });
});
