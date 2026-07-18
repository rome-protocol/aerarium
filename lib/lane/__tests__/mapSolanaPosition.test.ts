import { describe, it, expect } from "vitest";
import {
  mapSolanaPosition,
  tokenToUSD,
  type SolanaAssetRead,
} from "../mapSolanaPosition";
import { HEALTH_FACTOR_NO_DEBT } from "../positionStats";

// Hadrian cache-fed Comet shapes: base wUSDC (6dec, $1), wETH (8dec), wSOL (9dec).
const BASE = "0x9a8B4cB7326033d72cA393c6b4C0d7Fb904Fa900";
const WETH = "0x55e4502D799938582bC2A15771ACC6a4d2928273";
const WSOL = "0x8c965F79b3d9bb95C12687E533FD5490b9c251cC";

const x8 = (usd: number) => BigInt(Math.round(usd * 1e8));

function baseRead(over: Partial<SolanaAssetRead> = {}): SolanaAssetRead {
  return {
    symbol: "wUSDC",
    address: BASE,
    decimals: 6,
    isBase: true,
    priceUSDx8: x8(1),
    walletRaw: 0n,
    suppliedRaw: 0n,
    borrowedRaw: 0n,
    borrowCollateralFactorE18: 0n,
    supplyApyPct: 5.18,
    borrowApyPct: 7.62,
    ...over,
  };
}

function collatRead(over: Partial<SolanaAssetRead> = {}): SolanaAssetRead {
  return {
    symbol: "wETH",
    address: WETH,
    decimals: 8,
    isBase: false,
    priceUSDx8: x8(3000),
    walletRaw: 0n,
    suppliedRaw: 0n,
    borrowedRaw: 0n,
    borrowCollateralFactorE18: 800000000000000000n,
    supplyApyPct: 0,
    borrowApyPct: 0,
    ...over,
  };
}

describe("mapSolanaPosition — on-chain identity (displayAddress = SPL mint)", () => {
  const MINT = "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"; // an SPL mint (base58)
  it("uses the SPL mint as the row's displayed on-chain identity (not the EVM wrapper)", () => {
    const pos = mapSolanaPosition({
      assets: [baseRead(), collatRead({ mint: MINT })],
      borrowCapacityUSD: 0,
      healthFactor: null,
    });
    const weth = pos.assets.find((a) => a.sym === "wETH")!;
    expect(weth.displayAddress).toBe(MINT);
    expect(weth.displayAddress).not.toBe(WETH);
  });
  it("falls back to the EVM wrapper address when the mint read was unavailable", () => {
    const pos = mapSolanaPosition({
      assets: [baseRead(), collatRead({ mint: undefined })],
      borrowCapacityUSD: 0,
      healthFactor: null,
    });
    const weth = pos.assets.find((a) => a.sym === "wETH")!;
    expect(weth.displayAddress).toBe(WETH);
  });
});

describe("tokenToUSD", () => {
  it("scales raw token by decimals and 1e8 price", () => {
    // 2 wETH (8 dec) at $3000 = $6000
    expect(tokenToUSD(200_000_000n, 8, x8(3000))).toBeCloseTo(6000, 6);
    // 1000 wUSDC (6 dec) at $1 = $1000
    expect(tokenToUSD(1_000_000_000n, 6, x8(1))).toBeCloseTo(1000, 6);
  });

  it("returns 0 for zero balance or zero price", () => {
    expect(tokenToUSD(0n, 6, x8(1))).toBe(0);
    expect(tokenToUSD(1_000_000n, 6, 0n)).toBe(0);
  });
});

describe("mapSolanaPosition", () => {
  it("empty position: all zero, no-debt health sentinel, assets populated", () => {
    const pos = mapSolanaPosition({
      assets: [baseRead(), collatRead()],
      borrowCapacityUSD: 0,
      healthFactor: null,
    });
    expect(pos.supplied).toBe(0);
    expect(pos.borrowed).toBe(0);
    expect(pos.capacity).toBe(0);
    expect(pos.healthFactor).toBe(HEALTH_FACTOR_NO_DEBT);
    expect(pos.netApr).toBe(0);
    expect(pos.assets).toHaveLength(2);
  });

  it("base row carries wallet/supplied/borrowed in USD + both APYs", () => {
    const pos = mapSolanaPosition({
      assets: [
        baseRead({
          walletRaw: 900_000_000n, // 900 wUSDC wallet
          suppliedRaw: 1_500_000_000n, // 1500 supplied
          borrowedRaw: 4_200_000_000n, // 4200 debt
        }),
        collatRead(),
      ],
      borrowCapacityUSD: 8930,
      healthFactor: 2.12,
    });
    const base = pos.assets[0];
    expect(base.sym).toBe("wUSDC");
    expect(base.collateral).toBe(false);
    expect(base.walletBal).toBeCloseTo(900, 4);
    expect(base.suppliedBal).toBeCloseTo(1500, 4);
    expect(base.borrowedBal).toBeCloseTo(4200, 4);
    expect(base.supplyApy).toBe(5.18);
    expect(base.borrowApy).toBe(7.62);

    // totals
    expect(pos.supplied).toBeCloseTo(1500, 4); // base supply only (collat 0 here)
    expect(pos.borrowed).toBeCloseTo(4200, 4);
    expect(pos.capacity).toBe(8930);
    expect(pos.healthFactor).toBeCloseTo(2.12, 4);
  });

  it("carries token-unit balances (not USD) from raw reads + decimals", () => {
    const pos = mapSolanaPosition({
      assets: [
        baseRead({ walletRaw: 900_000_000n, borrowedRaw: 4_200_000_000n }), // 900 / 4200 wUSDC
        collatRead({ walletRaw: 300_000_000n, suppliedRaw: 200_000_000n }), // 3 / 2 wETH (8dec)
      ],
      borrowCapacityUSD: 0,
      healthFactor: null,
    });
    // base wUSDC: tokens == USD at $1
    expect(pos.assets[0].walletTokens).toBeCloseTo(900, 4);
    expect(pos.assets[0].borrowedTokens).toBeCloseTo(4200, 4);
    expect(pos.assets[0].priceUsd).toBeCloseTo(1, 6);
    // wETH ($3000): tokens are 3 / 2, NOT the $9000 / $6000 USD values
    expect(pos.assets[1].walletTokens).toBeCloseTo(3, 6);
    expect(pos.assets[1].suppliedTokens).toBeCloseTo(2, 6);
    expect(pos.assets[1].borrowedTokens).toBe(0); // collateral never carries debt tokens
    expect(pos.assets[1].priceUsd).toBeCloseTo(3000, 4);
  });

  it("collateral row: USD-scaled supplied, borrowApy forced to 0, collateral flag set", () => {
    const pos = mapSolanaPosition({
      assets: [
        baseRead(),
        collatRead({
          suppliedRaw: 200_000_000n, // 2 wETH supplied as collateral
          // even if a stray borrowApy sneaks in, collateral must read 0
          borrowApyPct: 9.9,
        }),
      ],
      borrowCapacityUSD: 4800,
      healthFactor: null,
    });
    const collat = pos.assets[1];
    expect(collat.sym).toBe("wETH");
    expect(collat.collateral).toBe(true);
    expect(collat.suppliedBal).toBeCloseTo(6000, 4); // 2 * $3000
    expect(collat.borrowApy).toBe(0); // collateral-only — no borrow column
    expect(collat.borrowedBal).toBe(0);
    // supplied total includes the collateral USD
    expect(pos.supplied).toBeCloseTo(6000, 4);
  });

  it("supplied total = base supply + every collateral USD", () => {
    const pos = mapSolanaPosition({
      assets: [
        baseRead({ suppliedRaw: 1_000_000_000n }), // 1000 base
        collatRead({ suppliedRaw: 100_000_000n }), // 1 wETH = $3000
        collatRead({
          symbol: "wSOL",
          address: WSOL,
          decimals: 9,
          priceUSDx8: x8(160),
          suppliedRaw: 10_000_000_000n, // 10 wSOL = $1600
        }),
      ],
      borrowCapacityUSD: 0,
      healthFactor: null,
    });
    expect(pos.supplied).toBeCloseTo(1000 + 3000 + 1600, 3);
    expect(pos.assets).toHaveLength(3);
  });

  it("clamps a huge/Infinity health factor for display", () => {
    const pos = mapSolanaPosition({
      assets: [baseRead()],
      borrowCapacityUSD: 0,
      healthFactor: Infinity,
    });
    expect(pos.healthFactor).toBe(HEALTH_FACTOR_NO_DEBT);
  });
});

describe("mapSolanaPosition — stale price feed (priceKnown / pricesStale seam)", () => {
  it("marks a held collateral whose feed reverts (priceUSDx8 0) as price-unknown + flags pricesStale", () => {
    // The live bug: wBTC getPrice reverts StalePriceFeed → lane reads priceUSDx8 0.
    const pos = mapSolanaPosition({
      assets: [
        baseRead({ suppliedRaw: 1_000_000n }), // 1 wUSDC base, $1 known
        collatRead({ priceUSDx8: 0n, suppliedRaw: 100_000_000n }), // 1 wETH supplied, feed reverting
      ],
      borrowCapacityUSD: 0,
      healthFactor: null,
    });
    expect(pos.assets[0].priceKnown).toBe(true); // base price always known ($1)
    expect(pos.assets[1].priceKnown).toBe(false); // collateral feed stale
    expect(pos.pricesStale).toBe(true); // user holds collateral we can't value
  });

  it("does not flag pricesStale when every held collateral price is known", () => {
    const pos = mapSolanaPosition({
      assets: [baseRead({ suppliedRaw: 1_000_000n }), collatRead({ suppliedRaw: 100_000_000n })],
      borrowCapacityUSD: 3000,
      healthFactor: null,
    });
    expect(pos.assets[1].priceKnown).toBe(true);
    expect(pos.pricesStale).toBeFalsy();
  });

  it("marks an UNHELD stale-feed collateral price-unknown but does NOT flag pricesStale", () => {
    // Feed stale but the user supplies none of it → their health/capacity is unaffected.
    const pos = mapSolanaPosition({
      assets: [baseRead({ suppliedRaw: 1_000_000n }), collatRead({ priceUSDx8: 0n, suppliedRaw: 0n })],
      borrowCapacityUSD: 0,
      healthFactor: null,
    });
    expect(pos.assets[1].priceKnown).toBe(false); // row still flagged for display
    expect(pos.pricesStale).toBeFalsy(); // but position health is fine
  });
});
