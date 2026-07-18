import { describe, it, expect, vi } from "vitest";
import type { Address } from "viem";
import { readWalletBalances, readReserveReads, readAccountReads } from "../reads";

// A fake CometReadClient that records how many multicall vs readContract calls
// happen, and answers each multicall contract by its functionName. The whole
// point of the batching fix is the CALL PATTERN (one multicall, not N+1
// readContracts), so asserting on these counters is asserting the behavior
// under change — paired with data-mapping assertions so it's not a pure
// mock-count test.
type Resp = Record<string, unknown>;
type MCEntry = { status: string; result?: unknown };
type MCContract = { functionName: string; args?: readonly unknown[] };
function fakeClient(byFn: Resp) {
  const ok = (result: unknown): MCEntry => ({ status: "success", result });
  const readContract = vi.fn(async () => 0n);
  const multicall = vi.fn(
    async ({ contracts }: { contracts: MCContract[] }): Promise<MCEntry[]> =>
      contracts.map((c) => ok(byFn[c.functionName] ?? 0n)),
  );
  return { client: { readContract, multicall }, readContract, multicall };
}

const BASE = "0xBASE000000000000000000000000000000000000" as Address;
const COMET = "0xC0met0000000000000000000000000000000000" as Address;
const BASE_FEED = "0xBaseFeed00000000000000000000000000000000" as Address;
const USER = "0xUser00000000000000000000000000000000000" as Address;
const a = (n: string): { asset: Address; priceFeed: Address } => ({
  asset: `0xA55e7${n}000000000000000000000000000000000` as Address,
  priceFeed: `0xFeed${n}0000000000000000000000000000000000` as Address,
});

describe("readWalletBalances", () => {
  it("issues ONE multicall for base + N collaterals (no per-asset readContract)", async () => {
    const { client, readContract, multicall } = fakeClient({});
    // distinct value per contract index so we can assert correct scatter
    multicall.mockImplementationOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async ({ contracts }: any) =>
        contracts.map((_: unknown, i: number) => ({ status: "success", result: BigInt(i + 1) })),
    );
    const out = await readWalletBalances(client, BASE, [a("1").asset, a("2").asset, a("3").asset], USER);

    expect(multicall).toHaveBeenCalledTimes(1);
    expect(readContract).not.toHaveBeenCalled();
    expect(multicall.mock.calls[0][0].contracts).toHaveLength(4); // base + 3 collats
    expect(out[BASE.toLowerCase()]).toBe(1n);
    expect(out[a("3").asset.toLowerCase()]).toBe(4n);
  });

  it("defaults a failed balance to 0n (allowFailure)", async () => {
    const { client, multicall } = fakeClient({});
    multicall.mockImplementationOnce(async () => [
      { status: "success", result: 5n },
      { status: "failure" },
    ]);
    const out = await readWalletBalances(client, BASE, [a("1").asset], USER);
    expect(out[BASE.toLowerCase()]).toBe(5n);
    expect(out[a("1").asset.toLowerCase()]).toBe(0n);
  });
});

describe("readAccountReads", () => {
  it("batches base + per-asset reads into ONE multicall", async () => {
    const assets = [a("1"), a("2")];
    const { client, readContract, multicall } = fakeClient({
      balanceOf: 100n,
      borrowBalanceOf: 20n,
      getPrice: 100_000_000n, // $1 @ 1e8
      isBorrowCollateralized: true,
      userCollateral: [42n, 0n], // (balance, _reserved) tuple
    });
    const out = await readAccountReads(client, COMET, BASE_FEED, USER, assets, 2);

    expect(multicall).toHaveBeenCalledTimes(1);
    expect(readContract).not.toHaveBeenCalled();
    // 4 base reads (balanceOf, borrowBalanceOf, getPrice, isBorrowCollateralized) + 2*2 per-asset
    expect(multicall.mock.calls[0][0].contracts).toHaveLength(8);
    expect(out.supplyBal).toBe(100n);
    expect(out.borrowBal).toBe(20n);
    expect(out.collateralized).toBe(true);
    expect(out.perAsset).toHaveLength(2);
    expect(out.perAsset[0].balance).toBe(42n); // tuple[0]
    expect(out.perAsset[0].priceX8).toBe(100_000_000n);
  });
});

describe("readReserveReads", () => {
  it("batches into 2 multicalls — collat reads + base physical balance fold into batch 1; only rates need utilization", async () => {
    const assets = [a("1"), a("2"), a("3")];
    const { client, readContract, multicall } = fakeClient({
      totalSupply: 1000n,
      totalBorrow: 200n,
      getUtilization: 50n,
      getPrice: 100_000_000n,
      balanceOf: 42n, // wrapper.balanceOf(comet) — collats AND the base physical balance
      getSupplyRate: 7n,
      getBorrowRate: 9n,
    });
    const out = await readReserveReads(client, COMET, BASE, BASE_FEED, assets);

    expect(multicall).toHaveBeenCalledTimes(2);
    expect(readContract).not.toHaveBeenCalled();
    // base 4 + 2N collat + 1 base balanceOf(comet) at the tail
    expect(multicall.mock.calls[0][0].contracts).toHaveLength(4 + 2 * 3 + 1);
    expect(multicall.mock.calls[1][0].contracts).toHaveLength(2); // supply + borrow rate
    // rate batch is called with the utilization read in batch 1
    expect(multicall.mock.calls[1][0].contracts[0].args).toEqual([50n]);

    expect(out.totalSupply).toBe(1000n);
    expect(out.totalBorrow).toBe(200n);
    expect(out.utilization).toBe(50n);
    expect(out.supplyRate).toBe(7n);
    expect(out.borrowRate).toBe(9n);
    expect(out.collats).toHaveLength(3);
    expect(out.collats[0].supplyRaw).toBe(42n);
    expect(out.collats[0].priceX8).toBe(100_000_000n);
    // The Comet's PHYSICAL base balance — the real withdraw/borrow ceiling.
    expect(out.baseBalanceRaw).toBe(42n);
  });

  it("baseBalanceRaw is null when the base balanceOf read fails (no false 0 → never zero-blocks liquidity)", async () => {
    const assets = [a("1")];
    const { client, multicall } = fakeClient({});
    // batch 1 has 4 base + 2*1 collat + 1 base-balance = 7 entries; fail only the
    // last (the base physical balance), succeed the rest.
    multicall
      .mockImplementationOnce(async ({ contracts }: { contracts: MCContract[] }) =>
        contracts.map((c, i) =>
          i === contracts.length - 1
            ? { status: "failure" }
            : { status: "success", result: c.functionName === "totalSupply" ? 1000n : c.functionName === "totalBorrow" ? 200n : 1n },
        ),
      )
      .mockImplementationOnce(async () => [
        { status: "success", result: 0n },
        { status: "success", result: 0n },
      ]);
    const out = await readReserveReads(client, COMET, BASE, BASE_FEED, assets);
    expect(out.totalSupply).toBe(1000n);
    expect(out.baseBalanceRaw).toBeNull();
  });
});
