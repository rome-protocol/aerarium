import { describe, it, expect } from "vitest";
import { mapEvmPosition, displayNameForSymbol, type MapEvmPositionInput } from "../mapEvmPosition";
import type { ReserveStat } from "@/lib/portal/hooks/useReserveStats";
import type { AccountStats, CollateralPosition } from "@/lib/portal/stats";
import { availableFor } from "../laneActions";

// Representative on-chain shapes (Hadrian multicollat Comet: base wUSDC + wETH/wSOL collats).
const BASE = "0x9a8B4cB7326033d72cA393c6b4C0d7Fb904Fa900";
const WETH = "0x55e4502D799938582bC2A15771ACC6a4d2928273";
const WSOL = "0x8c965F79b3d9bb95C12687E533FD5490b9c251cC";

// price-x8 helpers
const x8 = (usd: number) => BigInt(Math.round(usd * 1e8));

const reserves: ReserveStat[] = [
  {
    kind: "base",
    asset: BASE as `0x${string}`,
    priceFeed: "0x0000000000000000000000000000000000000001",
    decimals: 6,
    totalSupplyRaw: 0n,
    totalSupplyUSD: 0,
    totalBorrowRaw: 0n,
    totalBorrowUSD: 0,
    supplyApyPct: 5.18,
    borrowApyPct: 7.62,
    borrowCollateralFactorPct: 0,
  },
  {
    kind: "collateral",
    asset: WETH as `0x${string}`,
    priceFeed: "0x0000000000000000000000000000000000000002",
    decimals: 8,
    totalSupplyRaw: 0n,
    totalSupplyUSD: 0,
    totalBorrowRaw: null,
    totalBorrowUSD: null,
    supplyApyPct: null, // collats don't earn — mapper must coerce to 0
    borrowApyPct: null,
    borrowCollateralFactorPct: 80,
  },
  {
    kind: "collateral",
    asset: WSOL as `0x${string}`,
    priceFeed: "0x0000000000000000000000000000000000000003",
    decimals: 9,
    totalSupplyRaw: 0n,
    totalSupplyUSD: 0,
    totalBorrowRaw: null,
    totalBorrowUSD: null,
    supplyApyPct: null,
    borrowApyPct: null,
    borrowCollateralFactorPct: 70,
  },
];

// positions: user has 2 wETH supplied as collat (price $3000), 0 wSOL
const positions: CollateralPosition[] = [
  {
    asset: WETH as `0x${string}`,
    symbol: "wETH",
    balance: 2n * 10n ** 8n, // 2 wETH at 8 decimals
    decimals: 8,
    priceUSDx8: x8(3000),
    liquidateCollateralFactor: 85n * 10n ** 16n,
    borrowCollateralFactor: 80n * 10n ** 16n,
    supplyCap: 0n,
  },
  {
    asset: WSOL as `0x${string}`,
    symbol: "wSOL",
    balance: 0n,
    decimals: 9,
    priceUSDx8: x8(150),
    liquidateCollateralFactor: 75n * 10n ** 16n,
    borrowCollateralFactor: 70n * 10n ** 16n,
    supplyCap: 0n,
  },
];

const stats: AccountStats = {
  collateralValueUSD: 6000, // 2 wETH * $3000
  baseSupplyValueUSD: 0,
  borrowValueUSD: 1200, // borrowed 1200 wUSDC
  borrowCapacityUSD: 4800, // 6000 * 0.8
  liquidationThresholdUSD: 5100, // 6000 * 0.85
  availableToBorrowUSD: 3600,
  healthFactor: 4.25, // 5100 / 1200
  liquidationRiskPct: 0.235,
};

const baseInput: MapEvmPositionInput = {
  baseSymbol: "wUSDC",
  baseName: "USD Coin",
  baseDecimals: 6,
  baseAddress: BASE,
  basePriceUSDx8: x8(1),
  reserves,
  stats,
  positions,
  baseSupplyBalance: 0n,
  baseBorrowBalance: 1200n * 10n ** 6n, // 1200 wUSDC
  // wallet: 500 wUSDC, 1 wETH, 10 wSOL
  walletBalancesByAddress: {
    [BASE.toLowerCase()]: 500n * 10n ** 6n,
    [WETH.toLowerCase()]: 1n * 10n ** 8n,
    [WSOL.toLowerCase()]: 10n * 10n ** 9n,
  },
  symbolByAddress: {
    [BASE.toLowerCase()]: "wUSDC",
    [WETH.toLowerCase()]: "wETH",
    [WSOL.toLowerCase()]: "wSOL",
  },
};

describe("displayNameForSymbol", () => {
  it("maps known wrapper symbols to friendly names", () => {
    expect(displayNameForSymbol("wUSDC")).toBe("USD Coin");
    expect(displayNameForSymbol("wETH")).toBe("Wrapped Ether");
    expect(displayNameForSymbol("wSOL")).toBe("Wrapped SOL");
    expect(displayNameForSymbol("wBTC")).toBe("Wrapped Bitcoin");
  });
  it("falls back to the symbol itself for unknown demo tokens", () => {
    expect(displayNameForSymbol("wZZZ")).toBe("wZZZ");
  });
});

describe("mapEvmPosition", () => {
  it("puts the base asset first, collaterals after, with collateral flags", () => {
    const pos = mapEvmPosition(baseInput);
    expect(pos.assets).toHaveLength(3);
    expect(pos.assets[0].sym).toBe("wUSDC");
    expect(pos.assets[0].collateral).toBeFalsy();
    expect(pos.assets[1].sym).toBe("wETH");
    expect(pos.assets[1].collateral).toBe(true);
    expect(pos.assets[2].sym).toBe("wSOL");
    expect(pos.assets[2].collateral).toBe(true);
  });

  it("carries supplyApy/borrowApy from reserves; collats borrowApy=0", () => {
    const pos = mapEvmPosition(baseInput);
    expect(pos.assets[0].supplyApy).toBeCloseTo(5.18, 5);
    expect(pos.assets[0].borrowApy).toBeCloseTo(7.62, 5);
    // collat supplyApy comes from reserve (null) → coerced to 0; borrowApy always 0
    expect(pos.assets[1].supplyApy).toBe(0);
    expect(pos.assets[1].borrowApy).toBe(0);
  });

  it("computes per-asset wallet USD from wallet balances × price", () => {
    const pos = mapEvmPosition(baseInput);
    // base: 500 wUSDC × $1 = 500
    expect(pos.assets[0].walletBal).toBeCloseTo(500, 4);
    // wETH: 1 wETH × $3000 = 3000
    expect(pos.assets[1].walletBal).toBeCloseTo(3000, 4);
    // wSOL: 10 wSOL × $150 = 1500
    expect(pos.assets[2].walletBal).toBeCloseTo(1500, 4);
  });

  it("sets supplied/borrowed per-asset USD: base borrow on base row, collat supply on collat rows", () => {
    const pos = mapEvmPosition(baseInput);
    // base: supplied 0 (baseSupplyValueUSD), borrowed 1200
    expect(pos.assets[0].suppliedBal).toBeCloseTo(0, 4);
    expect(pos.assets[0].borrowedBal).toBeCloseTo(1200, 4);
    // wETH: supplied = 2 * 3000 = 6000, borrowed 0
    expect(pos.assets[1].suppliedBal).toBeCloseTo(6000, 4);
    expect(pos.assets[1].borrowedBal).toBe(0);
    // wSOL: supplied 0
    expect(pos.assets[2].suppliedBal).toBeCloseTo(0, 4);
  });

  it("carries token-unit balances (not USD) for amount-field / Max / validation", () => {
    const pos = mapEvmPosition(baseInput);
    // base: 500 wUSDC wallet (tokens == USD at $1), 1200 borrowed tokens, 0 supplied tokens
    expect(pos.assets[0].walletTokens).toBeCloseTo(500, 4);
    expect(pos.assets[0].borrowedTokens).toBeCloseTo(1200, 4);
    expect(pos.assets[0].suppliedTokens).toBeCloseTo(0, 4);
    expect(pos.assets[0].priceUsd).toBeCloseTo(1, 6);
    // wETH ($3000): wallet 1 token (NOT the $3000 USD value), supplied 2 tokens
    expect(pos.assets[1].walletTokens).toBeCloseTo(1, 6);
    expect(pos.assets[1].suppliedTokens).toBeCloseTo(2, 6);
    expect(pos.assets[1].priceUsd).toBeCloseTo(3000, 4);
    // wSOL ($150): wallet 10 tokens, borrowed tokens 0 (collateral)
    expect(pos.assets[2].walletTokens).toBeCloseTo(10, 6);
    expect(pos.assets[2].borrowedTokens).toBe(0);
  });

  it("frames position totals: supplied=baseSupply+collateral, borrowed, capacity, health", () => {
    const pos = mapEvmPosition(baseInput);
    expect(pos.supplied).toBeCloseTo(6000, 4); // 0 base supply + 6000 collateral
    expect(pos.borrowed).toBeCloseTo(1200, 4);
    expect(pos.capacity).toBeCloseTo(4800, 4);
    expect(pos.healthFactor).toBeCloseTo(4.25, 4);
  });

  it("values the base from raw tokens × base price, not the stale-feed stats USD", () => {
    // Live bug: useAccountStats derives baseSupplyValueUSD from the base price
    // feed, which reverts StalePriceFeed → $0, so a real 12 wUSDC supply rendered
    // "—" and didn't count toward the position total. The base is the unit of
    // account (≈$1); value it from its raw balance, independent of the feed.
    const staleBase: MapEvmPositionInput = {
      ...baseInput,
      baseSupplyBalance: 12n * 10n ** 6n, // 12 wUSDC supplied
      baseBorrowBalance: 0n,
      stats: { ...stats, baseSupplyValueUSD: 0, borrowValueUSD: 0, collateralValueUSD: 0 },
      positions: positions.map((p) => ({ ...p, balance: 0n })), // isolate the base
    };
    const pos = mapEvmPosition(staleBase);
    expect(pos.assets[0].suppliedTokens).toBeCloseTo(12, 4);
    expect(pos.assets[0].suppliedBal).toBeCloseTo(12, 4); // tokens × $1, NOT stats' $0
    expect(pos.supplied).toBeCloseTo(12, 4); // base counts toward the total
  });

  it("clamps Infinity health factor to a finite display value", () => {
    const noDebt: MapEvmPositionInput = {
      ...baseInput,
      stats: { ...stats, borrowValueUSD: 0, healthFactor: Infinity },
      baseBorrowBalance: 0n,
    };
    const pos = mapEvmPosition(noDebt);
    expect(Number.isFinite(pos.healthFactor)).toBe(true);
    expect(pos.healthFactor).toBeGreaterThanOrEqual(99);
  });

  it("computes a net APR (supply-weighted minus borrow-weighted)", () => {
    const pos = mapEvmPosition(baseInput);
    // supply side earns on collat (0% APY here) + base supply (0); borrow side
    // pays 7.62% on 1200 borrowed. Net should be negative here.
    expect(pos.netApr).toBeLessThan(0);
  });

  it("keeps collateral rows from on-chain positions when reserves (the USD/APY cache) is unavailable", () => {
    // Live bug (screenshot #39): the collateral roster came ONLY from `reserves`,
    // which is sourced from the /api/market USD/APY cache. When that cache was
    // momentarily unavailable to the client, useReserveStats returned reserves=null
    // → mapEvmPosition emitted just the base (wUSDC) row, hiding the user's supplied
    // collateral — even though a non-zero capacity ($83,606 live) from the SEPARATE
    // on-chain position query proved the collateral was there. The roster is an
    // on-chain fact (`positions`); it must survive a cache blip (APY degrades to 0).
    const cacheDown: MapEvmPositionInput = { ...baseInput, reserves: null };
    const pos = mapEvmPosition(cacheDown);
    expect(pos.assets.map((a) => a.sym)).toEqual(["wUSDC", "wETH", "wSOL"]);
    const weth = pos.assets.find((a) => a.sym === "wETH")!;
    expect(weth.collateral).toBe(true);
    expect(weth.suppliedTokens).toBeCloseTo(2, 6); // 2 wETH supplied stays visible
    expect(weth.suppliedBal).toBeCloseTo(6000, 4); // 2 × $3000
    expect(weth.priceUsd).toBeCloseTo(3000, 4); // price from the position read, not the cache
    expect(weth.supplyApy).toBe(0); // no reserve overlay → honest 0, not hidden
    // wallet balances (separate on-chain read) still reflected per collateral
    expect(weth.walletTokens).toBeCloseTo(1, 6);
  });

  it("returns the empty-but-populated shape when stats is null (pre-data)", () => {
    // Real pre-stats state: useAccountStats populates positions[] (with prices,
    // zero balances) for every market asset before computeUserAccountStats runs.
    const empty: MapEvmPositionInput = {
      ...baseInput,
      stats: null,
      positions: positions.map((p) => ({ ...p, balance: 0n })),
      baseSupplyBalance: 0n,
      baseBorrowBalance: 0n,
    };
    const pos = mapEvmPosition(empty);
    expect(pos.supplied).toBe(0);
    expect(pos.borrowed).toBe(0);
    expect(pos.capacity).toBe(0);
    // assets still populated from reserves so the table renders pre-position
    expect(pos.assets.length).toBe(3);
    expect(pos.assets[0].sym).toBe("wUSDC");
    // wallet balances still reflected even with no position
    expect(pos.assets[1].walletBal).toBeCloseTo(3000, 4);
  });
});

describe("mapEvmPosition — borrow Max during the liquidity-loading window", () => {
  it("liquidity NOT loaded yet (availableLiquidityRaw undefined) → liquidity is UNKNOWN (0), not unbounded", () => {
    // The ~5-7s reserves fetch: baseBorrowMin has loaded but availableLiquidityRaw
    // hasn't. limits must NOT default liquidity to Infinity — that lets the full
    // collateral capacity bind, so Max fills the whole capacity (e.g. 82,188 wUSDC)
    // which reverts on-chain. Treat unknown liquidity as 0 so borrow/withdraw GATE
    // until liquidity is actually known.
    const loading: MapEvmPositionInput = { ...baseInput, availableLiquidityRaw: undefined, baseBorrowMinRaw: 100_000n };
    const pos = mapEvmPosition(loading);
    expect(pos.limits?.availableLiquidityUsd).toBe(0); // was Number.POSITIVE_INFINITY
    const borrow = availableFor({ type: "borrow", asset: pos.assets[0], position: pos });
    expect(borrow.binding).toBe("liquidity");
    expect(borrow.tokens).toBe(0); // gated — NOT the ~3600 collateral capacity headroom
  });

  it("liquidity loaded → borrow Max is the liquidity-limited amount, not the collateral capacity", () => {
    // reserves loaded: only 2 wUSDC of base liquidity, capacity headroom far larger.
    const loaded: MapEvmPositionInput = { ...baseInput, availableLiquidityRaw: 2_000_000n, baseBorrowMinRaw: 100_000n };
    const pos = mapEvmPosition(loaded);
    expect(pos.limits?.availableLiquidityUsd).toBeCloseTo(2, 6);
    const borrow = availableFor({ type: "borrow", asset: pos.assets[0], position: pos });
    expect(borrow.binding).toBe("liquidity");
    expect(borrow.tokens).toBeGreaterThan(1.9); // ~2 × 0.999 safety haircut
    expect(borrow.tokens).toBeLessThanOrEqual(2); // NOT the ~3600 capacity headroom
  });
});
