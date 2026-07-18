import { describe, it, expect, vi } from "vitest";
import { createLiveSource, allocateByRatio } from "../liveSource";
import type { OnchainMarket } from "../onchain";
import type { IndexerClient, IndexerTx } from "../indexer/client";
import type { MarketSource } from "../MarketSource";

const COMET = "0x771D2f213b4C23f70Fa884d441a405F41F51Ab50";
const BASE = "0xba5e000000000000000000000000000000000001";
const USER_A = "0xaaaa000000000000000000000000000000000001";
const USER_B = "0xbbbb000000000000000000000000000000000002";

const onchain: OnchainMarket = {
  pool: { totalSuppliedUsd: 100, totalBorrowedUsd: 40, supplyAprPct: 5, borrowAprPct: 8, utilizationPct: 40 },
  markets: [
    { asset: "wUSDC", kind: "base", supplyApy: 5, borrowApy: 8, total: 100, util: 40, chains: ["evm", "sol"] },
    { asset: "wSOL", kind: "collateral", supplyApy: 0, borrowApy: 0, total: 320, util: 0, chains: ["evm", "sol"] },
  ],
  baseToken: BASE as `0x${string}`,
  baseDecimals: 6,
  basePriceUsd: 1,
  symbolByAddr: { [BASE]: { symbol: "wUSDC", decimals: 6 } },
  raw: { totalSupply: 100_000_000n, totalBorrow: 40_000_000n, utilization: 0n, basePrice: 100_000_000n, supplyRate: 0n, borrowRate: 0n, collats: [], baseBalanceRaw: 60_000_000n },
};

const TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (a: string) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const hexAmt = (n: bigint) => "0x" + n.toString(16).padStart(64, "0");

// 1 supply (evm) of 100 base + 1 supply (sol) of 50 base, distinct suppliers.
const txs: IndexerTx[] = [
  { hash: "0x1", method: "supply(address,uint256)", from: USER_A, to: COMET, origination: "ecdsa", timestamp: "t" },
  { hash: "0x2", method: "supply(address,uint256)", from: USER_B, to: COMET, origination: "solana", timestamp: "t" },
];
const logsByHash: Record<string, { address: string; topics: string[]; data: string }[]> = {
  "0x1": [{ address: BASE, topics: [TRANSFER_SIG, pad(USER_A), pad(COMET)], data: hexAmt(100_000_000n) }], // 100 base @6dp
  "0x2": [{ address: BASE, topics: [TRANSFER_SIG, pad(USER_B), pad(COMET)], data: hexAmt(50_000_000n) }], // 50 base
};

function fakeIndexer(): IndexerClient {
  return {
    listCometTxs: vi.fn(async () => txs),
    txLogs: vi.fn(async (h: string) => logsByHash[h] ?? []),
  };
}

const preview: MarketSource = {
  poolSplit: async () => ({ totalSupplied: 999, totalBorrowed: 0, totalCollateral: 0, netApr: 0, supplyApr: 0, borrowApr: 0, suppliedEvm: 0, suppliedSol: 0, borrowedEvm: 0, borrowedSol: 0, suppliers: 0, utilization: 0, illustrative: true }),
  arenaStats: async () => ({ evm: { liquidationsWon: 1, valueSeized: 0, biggestHit: 0, positionsDefended: 0, streak: 0 }, sol: { liquidationsWon: 2, valueSeized: 0, biggestHit: 0, positionsDefended: 0, streak: 0 }, illustrative: true }),
  openLiquidations: async () => [{ id: "p", side: "evm", borrower: "x", collateral: "wBTC", collateralUsd: 0, debt: "USDC", health: 1, reward: 0, age: "1m", illustrative: true }],
  markets: async () => [{ asset: "PREVIEW", kind: "x", supplyApy: 0, borrowApy: 0, total: 0, util: 0, chains: ["evm"] }],
  recentActivity: async () => [{ txHash: "0xprev", action: "supply", asset: "PREVIEW", amount: 0, lane: "evm", age: "1m", illustrative: true }],
};

describe("createLiveSource", () => {
  it("poolSplit composes on-chain numbers + indexer activity, illustrative=false", async () => {
    const src = createLiveSource({ readMarket: async () => onchain, indexer: fakeIndexer(), comet: COMET, fallback: preview });
    const p = await src.poolSplit();
    expect(p.illustrative).toBe(false);
    expect(p.totalSupplied).toBe(100);
    expect(p.totalBorrowed).toBe(40);
    // Total collateral = Σ of the on-chain collateral market rows (wSOL = 320);
    // the base row is excluded (it's the supplied/borrowed side, not collateral).
    expect(p.totalCollateral).toBe(320);
    expect(p.supplyApr).toBe(5);
    expect(p.borrowApr).toBe(8);
    expect(p.utilization).toBe(40);
    expect(p.suppliers).toBe(2);
    // Split allocates the REAL total (100) by the indexer lane ratio (gross
    // 100 evm : 50 sol = 2:1), so the parts sum to the headline total.
    expect(p.suppliedEvm).toBeCloseTo(66.667, 2);
    expect(p.suppliedSol).toBeCloseTo(33.333, 2);
    expect(p.suppliedEvm + p.suppliedSol).toBeCloseTo(p.totalSupplied, 6);
    // No withdraw activity in the fixture → borrow attribution unknown → 0/0,
    // but the real totalBorrowed headline is still 40.
    expect(p.borrowedEvm).toBe(0);
    expect(p.borrowedSol).toBe(0);
  });

  it("markets() returns the on-chain rows (not preview)", async () => {
    const src = createLiveSource({ readMarket: async () => onchain, indexer: fakeIndexer(), comet: COMET, fallback: preview });
    const rows = await src.markets();
    expect(rows.map((r) => r.asset)).toEqual(["wUSDC", "wSOL"]);
  });

  it("recentActivity() returns real cross-lane rows from the indexer", async () => {
    const src = createLiveSource({ readMarket: async () => onchain, indexer: fakeIndexer(), comet: COMET, fallback: preview });
    const rows = await src.recentActivity();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !r.illustrative)).toBe(true);
    expect(rows.map((r) => r.action)).toEqual(["supply", "supply"]);
    expect(rows.map((r) => r.lane).sort()).toEqual(["evm", "sol"]);
    expect(rows.map((r) => r.asset)).toEqual(["wUSDC", "wUSDC"]);
  });

  it("arenaStats() is real (illustrative=false), zero when no liquidation txs", async () => {
    const src = createLiveSource({ readMarket: async () => onchain, indexer: fakeIndexer(), comet: COMET, fallback: preview });
    const a = await src.arenaStats();
    expect(a.illustrative).toBe(false);
    expect(a.evm.liquidationsWon).toBe(0);
    expect(a.sol.liquidationsWon).toBe(0);
  });

  it("openLiquidations() is empty when no probe is provided (no fictitious rows)", async () => {
    const src = createLiveSource({ readMarket: async () => onchain, indexer: fakeIndexer(), comet: COMET, fallback: preview });
    expect(await src.openLiquidations()).toEqual([]);
  });

  it("openLiquidations() delegates candidate addresses to the injected probe", async () => {
    const probe = vi.fn(async (_candidates: string[]) => []);
    const src = createLiveSource({ readMarket: async () => onchain, indexer: fakeIndexer(), comet: COMET, fallback: preview, loadOpenLiquidations: probe });
    await src.openLiquidations();
    expect(probe).toHaveBeenCalledTimes(1);
    // candidates = distinct `from` (lowercased) across the comet's txs
    expect(probe.mock.calls[0][0].sort()).toEqual([USER_A.toLowerCase(), USER_B.toLowerCase()].sort());
  });

  it("falls back to preview poolSplit when the on-chain read throws", async () => {
    const src = createLiveSource({
      readMarket: async () => { throw new Error("rpc down"); },
      indexer: fakeIndexer(),
      comet: COMET,
      fallback: preview,
    });
    const p = await src.poolSplit();
    expect(p.illustrative).toBe(true); // degraded to preview, not a crash
    expect(p.totalSupplied).toBe(999);
  });

  it("falls back to preview markets when the on-chain read throws", async () => {
    const src = createLiveSource({
      readMarket: async () => { throw new Error("rpc down"); },
      indexer: fakeIndexer(),
      comet: COMET,
      fallback: preview,
    });
    expect((await src.markets())[0].asset).toBe("PREVIEW");
  });
});

describe("allocateByRatio", () => {
  it("splits a total by the two parts' ratio (sums back to total)", () => {
    const { evm, sol } = allocateByRatio(100, 100, 50);
    expect(evm).toBeCloseTo(66.667, 2);
    expect(sol).toBeCloseTo(33.333, 2);
    expect(evm + sol).toBeCloseTo(100, 6);
  });
  it("all to one lane when the other has no activity", () => {
    expect(allocateByRatio(6.1, 57.9, 0)).toEqual({ evm: 6.1, sol: 0 });
  });
  it("returns 0/0 when there is no attributing activity (can't split)", () => {
    expect(allocateByRatio(40, 0, 0)).toEqual({ evm: 0, sol: 0 });
  });
});
