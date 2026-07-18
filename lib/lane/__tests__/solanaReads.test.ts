import { describe, it, expect, vi } from "vitest";
import type { Address } from "viem";
import { readSolanaPosition, type SolanaPositionMeta } from "../solanaReads";

const COMET = "0xC0met0000000000000000000000000000000000" as Address;
const SYNTH = "0x5ynth000000000000000000000000000000000a" as Address;
const BASE = "0xbase0000000000000000000000000000000000a" as Address;
const SOL = "0x5o100000000000000000000000000000000000a" as Address;
const FEED = "0xfeed0000000000000000000000000000000000a" as Address;
const BASE_PRICE = 100_000_000n;

type MC = { status: string; result?: unknown; error?: unknown };
type MCArgs = { contracts: { functionName: string; args?: readonly unknown[] }[] };
const ok = (result: unknown): MC => ({ status: "success", result });
function fake(handler: (a: MCArgs) => Promise<MC[]>) {
  const readContract = vi.fn(async () => 0n);
  const multicall = vi.fn(handler);
  return { client: { readContract, multicall }, readContract, multicall };
}

const metas: SolanaPositionMeta[] = [
  { symbol: "wUSDC", address: BASE, isBase: true, decimals: 6, borrowCollateralFactorE18: 0n },
  {
    symbol: "wSOL",
    address: SOL,
    isBase: false,
    decimals: 9,
    priceFeed: FEED,
    priceFeedDecimals: 8,
    borrowCollateralFactorE18: 800_000_000_000_000_000n,
  },
];

describe("readSolanaPosition", () => {
  it("issues exactly 2 multicalls — positions+market+utilization in batch 1, rates in batch 2", async () => {
    const { client, readContract, multicall } = fake(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async ({ contracts }: any) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contracts.map((c: any) => {
          switch (c.functionName) {
            case "latestRoundData":
              return ok([0n, 16_000_000_000n, 0n, 0n, 0n]); // $160 @ 8dp
            case "borrowBalanceOf":
              return ok(7n);
            case "collateralBalanceOf":
              return ok(50n);
            case "balanceOf":
              return ok(11n); // wallet + baseSupply share this fn
            case "totalSupply":
              return ok(1000n);
            case "totalBorrow":
              return ok(200n);
            case "baseBorrowMin":
              return ok(5n);
            case "getUtilization":
              return ok(50n);
            case "getSupplyRate":
              return ok(0n);
            case "getBorrowRate":
              return ok(1_000_000_000n);
            default:
              return ok(0n);
          }
        }),
    );

    const { resolved, market } = await readSolanaPosition(client, COMET, SYNTH, metas, BASE_PRICE);

    expect(multicall).toHaveBeenCalledTimes(2);
    expect(readContract).not.toHaveBeenCalled();
    // batch1 = base(wallet,baseSupply,baseBorrow=3) + collat(wallet,collat,price=3)
    // + market/util(4) + base physical balanceOf(comet)(1) = 11
    expect(multicall.mock.calls[0][0].contracts).toHaveLength(11);
    expect(multicall.mock.calls[1][0].contracts).toHaveLength(2); // supply + borrow rate
    expect(multicall.mock.calls[1][0].contracts[0].args).toEqual([50n]); // rates take utilization

    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toMatchObject({
      symbol: "wUSDC",
      isBase: true,
      walletRaw: 11n,
      suppliedRaw: 11n,
      borrowedRaw: 7n,
      priceUSDx8: BASE_PRICE,
    });
    expect(resolved[0].borrowApyPct).toBeGreaterThan(0); // borrowRate>0 → base borrowable
    expect(resolved[1]).toMatchObject({
      symbol: "wSOL",
      isBase: false,
      walletRaw: 11n,
      suppliedRaw: 50n,
      priceUSDx8: 16_000_000_000n,
    });
    expect(resolved[1].supplyApyPct).toBe(0); // collaterals earn no supply APY
    expect(market).toMatchObject({
      totalSupplyBaseRaw: 1000n,
      totalBorrowBaseRaw: 200n,
      baseBorrowMinRaw: 5n,
      baseDecimals: 6,
      basePriceUSDx8: BASE_PRICE,
      // base wrapper.balanceOf(comet) — the physical liquidity ceiling (fake's balanceOf → 11n)
      baseBalanceRaw: 11n,
    });
  });

  it("skips the rates batch when utilization fails (still returns resolved, APY 0)", async () => {
    const { client, multicall } = fake(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async ({ contracts }: any) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contracts.map((c: any) => {
          if (c.functionName === "getUtilization") return { status: "failure", error: "x" };
          if (c.functionName === "latestRoundData") return ok([0n, 1n, 0n, 0n, 0n]);
          return ok(0n);
        }),
    );
    const { resolved } = await readSolanaPosition(client, COMET, SYNTH, metas, BASE_PRICE);
    expect(multicall).toHaveBeenCalledTimes(1); // no second (rates) batch
    expect(resolved[0].supplyApyPct).toBe(0);
    expect(resolved[0].borrowApyPct).toBe(0);
  });
});
