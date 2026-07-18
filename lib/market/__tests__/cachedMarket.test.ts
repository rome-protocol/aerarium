import { describe, it, expect, vi } from "vitest";
import { buildMarketState, toCacheSafe } from "../cachedMarket";
import { reviveBigints } from "../bigintJson";
import type { OnchainMarket } from "../onchain";

// A full OnchainMarket fixture (now incl. the raw ReserveReads bigints the EVM
// lane's capacity math needs — Issue 12). buildMarketState is the pure,
// cache-agnostic core; the unstable_cache wrapper (getCachedMarket) is NOT unit
// tested here (next/cache needs the Next runtime — Issue 3) — it's covered by
// the deferred Task −1 spike + Task 10 live measurement.
function fakeMarket(over: Partial<OnchainMarket> = {}): OnchainMarket {
  return {
    pool: { totalSuppliedUsd: 100, totalBorrowedUsd: 10, supplyAprPct: 1, borrowAprPct: 2, utilizationPct: 5 },
    markets: [
      { asset: "wUSDC", kind: "base", supplyApy: 1, borrowApy: 2, total: 100, util: 5, chains: ["evm", "sol"] },
      { asset: "wETH", kind: "collateral", supplyApy: 0, borrowApy: 0, total: 40, util: 0, chains: ["evm", "sol"] },
      { asset: "wSOL", kind: "collateral", supplyApy: 0, borrowApy: 0, total: 25, util: 0, chains: ["evm", "sol"] },
    ],
    baseToken: "0x0000000000000000000000000000000000000001",
    baseDecimals: 6,
    basePriceUsd: 1,
    symbolByAddr: {},
    raw: { totalSupply: 100n, totalBorrow: 10n, utilization: 0n, basePrice: 100000000n, supplyRate: 0n, borrowRate: 0n, collats: [], baseBalanceRaw: 90n },
    ...over,
  };
}

describe("buildMarketState (pure, cache-agnostic)", () => {
  it("derives totalCollateral, carries prices + raw bigints, reads once", async () => {
    const readMarket = vi.fn<() => Promise<OnchainMarket>>().mockResolvedValue(fakeMarket());
    const out = await buildMarketState({ readMarket });
    expect(out.totalCollateral).toBe(65); // 40 + 25, base row excluded
    expect(out.basePriceUsd).toBe(1);
    expect(out.raw.totalSupply).toBe(100n);
    expect(out.pool.totalSuppliedUsd).toBe(100);
    expect(readMarket).toHaveBeenCalledOnce();
  });

  it("propagates a read throw (so unstable_cache caches nothing)", async () => {
    const readMarket = vi.fn<() => Promise<OnchainMarket>>().mockRejectedValue(new Error("rpc down"));
    await expect(buildMarketState({ readMarket })).rejects.toThrow("rpc down");
  });
});

describe("toCacheSafe — survives the unstable_cache JSON.stringify boundary (Issue 12, cache side)", () => {
  it("raw bigints break JSON.stringify (the bug); toCacheSafe makes the value persistable + revivable", async () => {
    const state = await buildMarketState({
      readMarket: vi.fn<() => Promise<OnchainMarket>>().mockResolvedValue(fakeMarket()),
    });
    // unstable_cache persists the cached value via JSON.stringify internally — raw
    // bigints throw "Do not know how to serialize a BigInt", so the cache silently
    // stores nothing and never collapses load. This is the exact failure mode.
    expect(() => JSON.stringify(state)).toThrow();
    const safe = toCacheSafe(state);
    expect(() => JSON.stringify(safe)).not.toThrow();
    // …and it round-trips exactly through the same wire codec the client revives with.
    const revived = reviveBigints<typeof state>(JSON.stringify(safe));
    expect(revived.raw.totalSupply).toBe(state.raw.totalSupply);
    expect(revived.totalCollateral).toBe(state.totalCollateral);
  });
});
