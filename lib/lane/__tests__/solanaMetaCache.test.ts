import { describe, it, expect, beforeEach } from "vitest";
import type { Address } from "viem";
import { readSolanaMetaCache, writeSolanaMetaCache, clearSolanaMetaCache } from "../solanaMetaCache";
import type { SolanaPositionMeta } from "../solanaReads";

const COMET = "0xC0met0000000000000000000000000000000000" as Address;
const OTHER = "0xD1ff00000000000000000000000000000000000a" as Address;

const metas: SolanaPositionMeta[] = [
  { symbol: "wUSDC", address: "0xbase0000000000000000000000000000000000a" as Address, isBase: true, decimals: 6, borrowCollateralFactorE18: 0n },
  {
    symbol: "wSOL",
    address: "0x5o100000000000000000000000000000000000a" as Address,
    isBase: false,
    decimals: 9,
    priceFeed: "0xfeed0000000000000000000000000000000000a" as Address,
    priceFeedDecimals: 8,
    borrowCollateralFactorE18: 800_000_000_000_000_000n,
  },
];

describe("solanaMetaCache", () => {
  beforeEach(() => clearSolanaMetaCache());

  it("round-trips assetMetas including bigint collateral factors", () => {
    expect(readSolanaMetaCache(COMET)).toBeNull();
    writeSolanaMetaCache(COMET, metas);
    const got = readSolanaMetaCache(COMET);
    expect(got).toEqual(metas);
    expect(got![1].borrowCollateralFactorE18).toBe(800_000_000_000_000_000n); // bigint survives JSON
  });

  it("misses for a different comet — self-invalidating by address", () => {
    writeSolanaMetaCache(COMET, metas);
    expect(readSolanaMetaCache(OTHER)).toBeNull();
  });

  it("clear wipes the cache", () => {
    writeSolanaMetaCache(COMET, metas);
    clearSolanaMetaCache();
    expect(readSolanaMetaCache(COMET)).toBeNull();
  });
});
