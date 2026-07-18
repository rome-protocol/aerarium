// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const useMarketMock = vi.fn();
vi.mock("@/lib/market/useMarket", () => ({ useMarket: (...a: unknown[]) => useMarketMock(...a) }));

import { useReserveStats, deriveReserveStats } from "../useReserveStats";
import { reviveBigints, serializeBigints } from "@/lib/market/bigintJson";
import type { ReserveReads } from "../../reads";
import type { CometMarket } from "../useCometMarket";

// Large, > 2^53 bigints — the exact case Number() would corrupt.
const reads: ReserveReads = {
  totalSupply: 123456789012345678901234567890n,
  totalBorrow: 98765432109876543210n,
  utilization: 650000000000000000n,
  basePrice: 100000000n,
  supplyRate: 1000000000n,
  borrowRate: 2000000000n,
  collats: [
    { supplyRaw: 5000000000000000000n, priceX8: 200000000000n }, // 5e18 @ $2000
    { supplyRaw: 30000000000n, priceX8: 15000000000n }, // 30e9 @ $150
  ],
  baseBalanceRaw: 111111111111111111111n,
};

const market: CometMarket = {
  comet: "0x771D2f213b4C23f70Fa884d441a405F41F51Ab50",
  baseToken: "0xba5e000000000000000000000000000000000001",
  baseTokenPriceFeed: "0xfeed000000000000000000000000000000000001",
  numAssets: 2,
  assets: [
    { index: 0, asset: "0xe700000000000000000000000000000000000001", priceFeed: "0xef00000000000000000000000000000000000001", scale: 1000000000000000000n, borrowCollateralFactor: 800000000000000000n, liquidateCollateralFactor: 900000000000000000n, liquidationFactor: 950000000000000000n, supplyCap: 0n },
    { index: 1, asset: "0x5011000000000000000000000000000000000001", priceFeed: "0x5f00000000000000000000000000000000000001", scale: 1000000000n, borrowCollateralFactor: 700000000000000000n, liquidateCollateralFactor: 0n, liquidationFactor: 0n, supplyCap: 0n },
  ],
};

describe("deriveReserveStats — frozen-fixture parity across the JSON boundary (Issue 12)", () => {
  it("derivation is identical before vs after serialize→revive (no precision loss)", () => {
    const original = deriveReserveStats(reads, market, 6);
    const roundTripped = deriveReserveStats(reviveBigints<ReserveReads>(serializeBigints(reads)), market, 6);
    expect(roundTripped).toEqual(original);
    // The base raw bigints (which feed availableLiquidityRaw + capacity) survive EXACTLY.
    expect(roundTripped[0].totalSupplyRaw).toBe(123456789012345678901234567890n);
    expect(roundTripped[0].totalBorrowRaw).toBe(98765432109876543210n);
    // The base PHYSICAL balance (the liquidity ceiling) survives the boundary too.
    expect(roundTripped[0].baseBalanceRaw).toBe(111111111111111111111n);
    // Collat raw survives too.
    expect(roundTripped[1].totalSupplyRaw).toBe(5000000000000000000n);
  });
});

describe("useReserveStats — sourced from useMarket (shape-preserving, no 12s poll)", () => {
  it("returns {reserves,loading,error,refresh} derived from the cache, with no setInterval", () => {
    const refetch = vi.fn(async () => ({}));
    useMarketMock.mockReturnValue({ data: { state: { raw: reads }, activity: [], liquidatable: [] }, isLoading: false, error: null, refetch });
    const spy = vi.spyOn(globalThis, "setInterval");
    const { result } = renderHook(() => useReserveStats(market, 6, 200010));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refresh).toBe("function");
    expect(result.current.reserves).toEqual(deriveReserveStats(reads, market, 6));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("reserves is null while the market is unresolved", () => {
    useMarketMock.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    const { result } = renderHook(() => useReserveStats(market, 6, 200010));
    expect(result.current.reserves).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it("surfaces a query error as a string message", () => {
    useMarketMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error("api 500"), refetch: vi.fn() });
    const { result } = renderHook(() => useReserveStats(market, 6, 200010));
    expect(result.current.error).toBe("api 500");
  });

  it("reserves is null (no crash) when the cache payload is malformed/partial", () => {
    useMarketMock.mockReturnValue({ data: {}, isLoading: false, error: null, refetch: vi.fn() });
    const { result } = renderHook(() => useReserveStats(market, 6, 200010));
    expect(result.current.reserves).toBeNull();
  });
});

// Value-computation coverage migrated from the old renderHook+wagmi-mock test
// (lib/portal/__tests__/useReserveStats.test.ts) — now exercised against the
// pure derivation directly, no QueryClient/multicall mock needed.
describe("deriveReserveStats — value computations", () => {
  it("derives base + N collat rows with correct kinds, USD, and collateral-factor %", () => {
    const r: ReserveReads = {
      totalSupply: 1_000_000n,
      totalBorrow: 0n,
      utilization: 0n,
      basePrice: 100_000_000n, // $1.00 @8dp
      supplyRate: 0n,
      borrowRate: 0n,
      collats: [
        { supplyRaw: 1_000_000n, priceX8: 100_000_000n },
        { supplyRaw: 1_000_000n, priceX8: 100_000_000n },
      ],
      baseBalanceRaw: 900_000n, // deficit: net = 1_000_000 but only 0.9 held
    };
    const m: CometMarket = {
      comet: "0xb8Ad4fd3776E356d1295E7539FCec02Da4629856",
      baseToken: "0x9a8B4cB7326033d72cA393c6b4C0d7Fb904Fa900",
      baseTokenPriceFeed: "0xFf1adC858a6e16aD146b020da1CBfa5891a76f97",
      numAssets: 2,
      assets: [
        { index: 0, asset: "0x55e4502D799938582bC2A15771ACC6a4d2928273", priceFeed: "0xbE869FCA226545927E671E60F32720dB9dEc5980", scale: 10n ** 8n, borrowCollateralFactor: 700_000_000_000_000_000n, liquidateCollateralFactor: 0n, liquidationFactor: 0n, supplyCap: 0n },
        { index: 1, asset: "0x8c965F79b3d9bb95C12687E533FD5490b9c251cC", priceFeed: "0x63C28E0adE03B38e32b9cD85f2dD9B9fbB89185F", scale: 10n ** 9n, borrowCollateralFactor: 650_000_000_000_000_000n, liquidateCollateralFactor: 0n, liquidationFactor: 0n, supplyCap: 0n },
      ],
    };
    const out = deriveReserveStats(r, m, 6);
    expect(out).toHaveLength(3); // 1 base + 2 collats
    expect(out.map((x) => x.kind)).toEqual(["base", "collateral", "collateral"]);
    expect(out[0].totalSupplyUSD).toBeCloseTo(1.0, 6); // 1 wUSDC × $1
    expect(out[1].borrowCollateralFactorPct).toBe(70); // 7e17 → 70%
    expect(out[2].borrowCollateralFactorPct).toBe(65); // 6.5e17 → 65%
    // Base row carries the comet's physical base balance (the liquidity ceiling);
    // collats don't (it's a base-only concept).
    expect(out[0].baseBalanceRaw).toBe(900_000n);
    expect(out[1].baseBalanceRaw).toBeNull();
  });
});
