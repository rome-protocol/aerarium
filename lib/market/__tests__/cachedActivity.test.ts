import { describe, it, expect, vi } from "vitest";
import { buildActivity, buildLiquidatable } from "../cachedMarket";
import type { IndexerClient, IndexerTx } from "../indexer/client";

const COMET = "0x771D2f213b4C23f70Fa884d441a405F41F51Ab50";
const TOKEN = "0xba5e000000000000000000000000000000000001";
const USER = "0xaaaa000000000000000000000000000000000001";
const TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (a: string) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const hexAmt = (n: bigint) => "0x" + n.toString(16).padStart(64, "0");

function indexerOf(over: Partial<IndexerClient> & { txs?: IndexerTx[] } = {}): IndexerClient {
  const txs = over.txs ?? [];
  return {
    listCometTxs: over.listCometTxs ?? (async () => txs),
    txLogs: over.txLogs ?? (async () => []),
  };
}

describe("buildActivity (pure, cache-agnostic)", () => {
  it("aggregates a supply tx with the comet-involved transfer resolved by symbolByAddr", async () => {
    const indexer = indexerOf({
      txs: [{ hash: "0x1", method: "supply(address,uint256)", from: USER, to: COMET, origination: "ecdsa", timestamp: new Date().toISOString() }],
      txLogs: async () => [{ address: TOKEN, topics: [TRANSFER_SIG, pad(USER), pad(COMET)], data: hexAmt(100_000_000n) }],
    });
    const rows = await buildActivity({ indexer, comet: COMET, symbolByAddr: { [TOKEN.toLowerCase()]: { symbol: "wUSDC", decimals: 6 } }, nowMs: Date.now() });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "supply", lane: "evm", asset: "wUSDC", amount: 100 });
  });

  it("propagates a strict-indexer throw (so unstable_cache caches nothing)", async () => {
    const indexer = indexerOf({ listCometTxs: async () => { throw new Error("indexer down"); } });
    await expect(buildActivity({ indexer, comet: COMET, symbolByAddr: {}, nowMs: 0 })).rejects.toThrow("indexer down");
  });
});

describe("buildLiquidatable (pure, cache-agnostic)", () => {
  it("returns only the liquidatable candidates, de-duped + lowercased, mapped to rows", async () => {
    const indexer = indexerOf({
      txs: [
        { hash: "0x1", method: "supply", from: "0xAAA0000000000000000000000000000000000001", to: COMET, origination: "ecdsa", timestamp: "t" },
        { hash: "0x2", method: "borrow", from: "0xBBB0000000000000000000000000000000000002", to: COMET, origination: "ecdsa", timestamp: "t" },
        { hash: "0x3", method: "supply", from: "0xAAA0000000000000000000000000000000000001", to: COMET, origination: "ecdsa", timestamp: "t" },
      ],
    });
    const checkLiquidatable = vi.fn(async (accts: string[]) => accts.map((a) => a === "0xbbb0000000000000000000000000000000000002"));
    const out = await buildLiquidatable({ indexer, comet: COMET, baseSymbol: "wUSDC", checkLiquidatable });
    // 0xAAA appears twice → one candidate; checkLiquidatable called with 2 distinct lowercased addrs.
    expect(checkLiquidatable).toHaveBeenCalledWith(["0xaaa0000000000000000000000000000000000001", "0xbbb0000000000000000000000000000000000002"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "0xbbb0000000000000000000000000000000000002", debt: "wUSDC", side: "evm" });
  });

  it("returns [] when there are no candidates (without calling the chain)", async () => {
    const checkLiquidatable = vi.fn(async () => []);
    const out = await buildLiquidatable({ indexer: indexerOf({ txs: [] }), comet: COMET, baseSymbol: "wUSDC", checkLiquidatable });
    expect(out).toEqual([]);
    expect(checkLiquidatable).not.toHaveBeenCalled();
  });
});
