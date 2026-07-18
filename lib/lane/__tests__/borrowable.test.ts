import { describe, it, expect } from "vitest";
import { mapEvmPosition, type MapEvmPositionInput } from "../mapEvmPosition";
import { mapSolanaPosition, type SolanaAssetRead } from "../mapSolanaPosition";
import type { ReserveStat } from "@/lib/portal/hooks/useReserveStats";
import type { AccountStats, CollateralPosition } from "@/lib/portal/stats";

// Bug B invariant: in a Compound v3 Comet only the BASE asset is borrowable;
// collaterals are supply-only. `borrowable` must be true for the base row and
// false for every collateral row — DECOUPLED from borrowApy, so a base asset
// whose borrowApy reads 0 (or hasn't loaded) is still borrowable and still
// shows [Supply][Borrow] + all four tabs.

const BASE = "0x9a8B4cB7326033d72cA393c6b4C0d7Fb904Fa900";
const WETH = "0x55e4502D799938582bC2A15771ACC6a4d2928273";
const WSOL = "0x8c965F79b3d9bb95C12687E533FD5490b9c251cC";
const x8 = (usd: number) => BigInt(Math.round(usd * 1e8));

describe("borrowable invariant — mapEvmPosition", () => {
  const reserves: ReserveStat[] = [
    {
      kind: "base", asset: BASE as `0x${string}`,
      priceFeed: "0x0000000000000000000000000000000000000001",
      decimals: 6, totalSupplyRaw: 0n, totalSupplyUSD: 0, totalBorrowRaw: 0n, totalBorrowUSD: 0,
      // Base borrow rate reads 0 here — the dead-end case. borrowable must
      // STILL be true (it is the base asset).
      supplyApyPct: 5.18, borrowApyPct: 0, borrowCollateralFactorPct: 0,
    },
    {
      kind: "collateral", asset: WETH as `0x${string}`,
      priceFeed: "0x0000000000000000000000000000000000000002",
      decimals: 8, totalSupplyRaw: 0n, totalSupplyUSD: 0, totalBorrowRaw: null, totalBorrowUSD: null,
      supplyApyPct: null, borrowApyPct: null, borrowCollateralFactorPct: 80,
    },
    {
      kind: "collateral", asset: WSOL as `0x${string}`,
      priceFeed: "0x0000000000000000000000000000000000000003",
      decimals: 9, totalSupplyRaw: 0n, totalSupplyUSD: 0, totalBorrowRaw: null, totalBorrowUSD: null,
      supplyApyPct: null, borrowApyPct: null, borrowCollateralFactorPct: 70,
    },
  ];
  const positions: CollateralPosition[] = [
    { asset: WETH as `0x${string}`, symbol: "wETH", balance: 0n, decimals: 8, priceUSDx8: x8(3000), liquidateCollateralFactor: 0n, borrowCollateralFactor: 0n, supplyCap: 0n },
    { asset: WSOL as `0x${string}`, symbol: "wSOL", balance: 0n, decimals: 9, priceUSDx8: x8(150), liquidateCollateralFactor: 0n, borrowCollateralFactor: 0n, supplyCap: 0n },
  ];
  const stats: AccountStats = {
    collateralValueUSD: 0, baseSupplyValueUSD: 0, borrowValueUSD: 0, borrowCapacityUSD: 0,
    liquidationThresholdUSD: 0, availableToBorrowUSD: 0, healthFactor: Infinity, liquidationRiskPct: 0,
  };
  const input: MapEvmPositionInput = {
    baseSymbol: "wUSDC", baseDecimals: 6, baseAddress: BASE, basePriceUSDx8: x8(1),
    reserves, stats, positions, baseSupplyBalance: 0n, baseBorrowBalance: 0n,
    walletBalancesByAddress: {}, symbolByAddress: { [WETH.toLowerCase()]: "wETH", [WSOL.toLowerCase()]: "wSOL" },
  };

  it("base row is borrowable even when its borrowApy is 0", () => {
    const pos = mapEvmPosition(input);
    expect(pos.assets[0].sym).toBe("wUSDC");
    expect(pos.assets[0].borrowApy).toBe(0); // rate is 0 / unloaded
    expect(pos.assets[0].borrowable).toBe(true); // …but still borrowable
  });

  it("collateral rows are NOT borrowable", () => {
    const pos = mapEvmPosition(input);
    expect(pos.assets[1].sym).toBe("wETH");
    expect(pos.assets[1].borrowable).toBe(false);
    expect(pos.assets[2].sym).toBe("wSOL");
    expect(pos.assets[2].borrowable).toBe(false);
  });

  it("exactly one borrowable asset (the base)", () => {
    const pos = mapEvmPosition(input);
    expect(pos.assets.filter((a) => a.borrowable)).toHaveLength(1);
    expect(pos.assets.filter((a) => a.borrowable)[0].collateral).toBeFalsy();
  });
});

describe("borrowable invariant — mapSolanaPosition", () => {
  function baseRead(over: Partial<SolanaAssetRead> = {}): SolanaAssetRead {
    return {
      symbol: "wUSDC", address: BASE, decimals: 6, isBase: true, priceUSDx8: x8(1),
      walletRaw: 0n, suppliedRaw: 0n, borrowedRaw: 0n, borrowCollateralFactorE18: 0n,
      // base borrow rate 0 — dead-end case
      supplyApyPct: 5.18, borrowApyPct: 0, ...over,
    };
  }
  function collatRead(over: Partial<SolanaAssetRead> = {}): SolanaAssetRead {
    return {
      symbol: "wETH", address: WETH, decimals: 8, isBase: false, priceUSDx8: x8(3000),
      walletRaw: 0n, suppliedRaw: 0n, borrowedRaw: 0n, borrowCollateralFactorE18: 800000000000000000n, supplyApyPct: 0, borrowApyPct: 0, ...over,
    };
  }

  it("base row is borrowable even when its borrowApy is 0", () => {
    const pos = mapSolanaPosition({ assets: [baseRead(), collatRead()], borrowCapacityUSD: 0, healthFactor: null });
    expect(pos.assets[0].sym).toBe("wUSDC");
    expect(pos.assets[0].borrowApy).toBe(0);
    expect(pos.assets[0].borrowable).toBe(true);
  });

  it("collateral rows are NOT borrowable (even if a stray borrowApy sneaks in)", () => {
    const pos = mapSolanaPosition({
      assets: [baseRead(), collatRead({ borrowApyPct: 9.9 })],
      borrowCapacityUSD: 0, healthFactor: null,
    });
    expect(pos.assets[1].sym).toBe("wETH");
    expect(pos.assets[1].borrowable).toBe(false);
  });

  it("exactly one borrowable asset (the base)", () => {
    const pos = mapSolanaPosition({
      assets: [
        baseRead(),
        collatRead(),
        collatRead({ symbol: "wSOL", address: WSOL, decimals: 9, priceUSDx8: x8(150) }),
      ],
      borrowCapacityUSD: 0, healthFactor: null,
    });
    expect(pos.assets.filter((a) => a.borrowable)).toHaveLength(1);
    // The sole borrowable asset is the base (collateral:false).
    expect(pos.assets.filter((a) => a.borrowable)[0].collateral).toBe(false);
  });
});
