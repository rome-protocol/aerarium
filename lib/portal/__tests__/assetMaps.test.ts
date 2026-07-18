import { describe, it, expect } from "vitest";

import { buildAssetMaps } from "../assetMaps";

// Hadrian (200010) base wUSDC (#240 wrapper set).
const HADRIAN_BASE = "0xd4cc34b67c805d472b5a709a22a1037f6b16ef28";

describe("buildAssetMaps resolves the ACTIVE chain's collaterals", () => {
  it("maps Hadrian (200010) collateral addresses to their symbols + decimals", () => {
    const { symbolByAsset, decimalsByAsset } = buildAssetMaps(
      200010,
      HADRIAN_BASE,
      "wUSDC",
      6,
    );
    expect(symbolByAsset[HADRIAN_BASE.toLowerCase()]).toBe("wUSDC");
    // wETH + wJitoSOL on Hadrian — the addresses that were rendering raw.
    expect(symbolByAsset["0x8c2c1486cadf7d07312908a065f14af65f56be7e"]).toBe("wETH");
    expect(symbolByAsset["0x1ae3f6327a919c33ebb7590df3d14e3f222f2b04"]).toBe("wJitoSOL");
    expect(decimalsByAsset["0x8c2c1486cadf7d07312908a065f14af65f56be7e"]).toBe(8);
  });

  it("is chain-keyed — does NOT leak another chain's collaterals (the build-default bug)", () => {
    const hadrian = buildAssetMaps(200010, HADRIAN_BASE, "wUSDC", 6).symbolByAsset;
    const aurelius = buildAssetMaps(30001, HADRIAN_BASE, "wUSDC", 6).symbolByAsset;
    // Hadrian's wJitoSOL must resolve on 200010 and be absent on 30001.
    expect(hadrian["0x1ae3f6327a919c33ebb7590df3d14e3f222f2b04"]).toBe("wJitoSOL");
    expect(aurelius["0x1ae3f6327a919c33ebb7590df3d14e3f222f2b04"]).toBeUndefined();
  });
});
