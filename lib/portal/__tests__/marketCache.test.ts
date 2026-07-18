import { describe, it, expect, beforeEach } from "vitest";
import { readMarketCache, writeMarketCache, clearMarketCache } from "../marketCache";
import type { CometMarket } from "../hooks/useCometMarket";

const COMET = "0x771D2f213b4C23f70Fa884d441a405F41F51Ab50";

function sampleMarket(): CometMarket {
  return {
    comet: COMET as `0x${string}`,
    baseToken: "0x9a8B4cB7326033d72cA393c6b4C0d7Fb904Fa900",
    baseTokenPriceFeed: "0xe6b9bD3d50E3E4bF73724065E6F9f99Fd1b8B027",
    numAssets: 2,
    assets: [
      {
        index: 0,
        asset: "0x55e4502D799938582bC2A15771ACC6a4d2928273",
        priceFeed: "0xED815CAe213b16B092d531D0a511E77D43a3C805",
        scale: 100000000n,
        borrowCollateralFactor: 800000000000000000n,
        liquidateCollateralFactor: 900000000000000000n,
        liquidationFactor: 950000000000000000n,
        supplyCap: 1000000000000000000000n,
      },
      {
        index: 1,
        asset: "0xa000137fFcB2808aB6D2094c6f7Db5830c437883",
        priceFeed: "0x63Ecae6b814f4A6a8E31CF4B38C82fee21b5a842",
        scale: 1000000000n,
        borrowCollateralFactor: 700000000000000000n,
        liquidateCollateralFactor: 850000000000000000n,
        liquidationFactor: 900000000000000000n,
        supplyCap: 500000000000000000n,
      },
    ],
  } as CometMarket;
}

describe("marketCache — immutable Comet shape cache", () => {
  beforeEach(() => clearMarketCache());

  it("returns null for a cold key", () => {
    expect(readMarketCache(200010, COMET)).toBeNull();
  });

  it("round-trips a market, preserving bigint asset fields", () => {
    const m = sampleMarket();
    writeMarketCache(200010, COMET, m);
    const got = readMarketCache(200010, COMET);
    expect(got).toEqual(m);
    expect(typeof got!.assets[0].scale).toBe("bigint");
    expect(got!.assets[0].supplyCap).toBe(1000000000000000000000n);
    expect(got!.assets[1].borrowCollateralFactor).toBe(700000000000000000n);
  });

  it("keys by chainId + comet (no cross-talk)", () => {
    writeMarketCache(200010, COMET, sampleMarket());
    expect(readMarketCache(999, COMET)).toBeNull();
    expect(readMarketCache(200010, "0x0000000000000000000000000000000000000000")).toBeNull();
  });

  it("matches the comet address case-insensitively", () => {
    writeMarketCache(200010, COMET, sampleMarket());
    expect(readMarketCache(200010, COMET.toLowerCase())).not.toBeNull();
  });

  it("never throws on a cold read", () => {
    expect(() => readMarketCache(200010, "0xWhatever")).not.toThrow();
  });
});
