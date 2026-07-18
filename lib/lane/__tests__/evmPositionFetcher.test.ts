import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock only the two I/O reads; keep computeUserAccountStats real so the
// composition (reads → perAsset map → stats) is exercised end-to-end.
vi.mock("@/lib/portal/reads", () => ({
  readAccountReads: vi.fn(),
  readWalletBalances: vi.fn(),
}));
import { readAccountReads, readWalletBalances } from "@/lib/portal/reads";
import { fetchEvmPosition } from "../evmPositionFetcher";

const market = {
  comet: "0xComet",
  baseToken: "0xBase",
  baseTokenPriceFeed: "0xFeed",
  numAssets: 1,
  assets: [
    {
      asset: "0xCollA",
      index: 0,
      scale: 1_000_000n,
      liquidateCollateralFactor: 9n * 10n ** 17n,
      borrowCollateralFactor: 8n * 10n ** 17n,
      supplyCap: 10n ** 24n,
      priceFeed: "0xpf",
    },
  ],
} as never;

describe("fetchEvmPosition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("composes account reads + wallet balances + perAsset mapping", async () => {
    vi.mocked(readAccountReads).mockResolvedValue({
      supplyBal: 5_000_000n,
      borrowBal: 0n,
      basePrice: 100_000_000n, // $1 (1e8)
      collateralized: true,
      perAsset: [{ balance: 2_000_000n, priceX8: 200_000_000n }], // $2
    } as never);
    vi.mocked(readWalletBalances).mockResolvedValue({ "0xbase": 9n, "0xcolla": 3n } as never);

    const res = await fetchEvmPosition({
      publicClient: {} as never,
      market,
      baseAsset: "0xBase",
      user: "0xUser",
      baseDecimals: 6,
      decimalsByAsset: { "0xcolla": 6 },
      symbolByAsset: { "0xcolla": "COLA" },
    });

    expect(res.baseSupplyBalance).toBe(5_000_000n);
    expect(res.baseBorrowBalance).toBe(0n);
    expect(res.isBorrowCollateralized).toBe(true);
    expect(res.walletBalances).toEqual({ "0xbase": 9n, "0xcolla": 3n });
    expect(res.positions).toHaveLength(1);
    expect(res.positions[0]).toMatchObject({
      asset: "0xCollA",
      symbol: "COLA",
      balance: 2_000_000n,
      decimals: 6,
      priceUSDx8: 200_000_000n,
    });
    expect(res.stats).toBeTruthy();
  });

  it("falls back to assetN symbol + scale-derived decimals on a map miss (parity with useAccountStats)", async () => {
    vi.mocked(readAccountReads).mockResolvedValue({
      supplyBal: 0n,
      borrowBal: 0n,
      basePrice: 100_000_000n,
      collateralized: true,
      perAsset: [{ balance: 0n, priceX8: 0n }],
    } as never);
    vi.mocked(readWalletBalances).mockResolvedValue({} as never);

    const res = await fetchEvmPosition({
      publicClient: {} as never,
      market,
      baseAsset: "0xBase",
      user: "0xUser",
      baseDecimals: 6,
      decimalsByAsset: {},
      symbolByAsset: {},
    });

    expect(res.positions[0].symbol).toBe("asset0");
    expect(res.positions[0].decimals).toBe(6); // scale 1e6 → 6 decimals
  });
});
