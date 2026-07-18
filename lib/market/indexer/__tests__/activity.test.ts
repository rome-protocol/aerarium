import { describe, it, expect } from "vitest";
import { classifyAction, aggregateRecentActivity } from "../activity";
import type { IndexerTx } from "../client";
import type { TransferEvent } from "../decode";

const COMET = "0xc0met0000000000000000000000000000000000";
const BASE = "0xba5e000000000000000000000000000000000001";
const SOL = "0x5o1c000000000000000000000000000000000002";
const USER = "0xaaaa000000000000000000000000000000000003";
const t = (token: string, from: string, to: string, amount: bigint): TransferEvent => ({
  token: token as `0x${string}`, from: from as `0x${string}`, to: to as `0x${string}`, amount,
});
const symbolByAddr = {
  [BASE]: { symbol: "wUSDC", decimals: 6 },
  [SOL]: { symbol: "wSOL", decimals: 9 },
};

describe("classifyAction", () => {
  it("maps comet method names to actions", () => {
    expect(classifyAction("supply(address,uint256)")).toBe("supply");
    expect(classifyAction("withdraw(address,uint256)")).toBe("withdraw");
    expect(classifyAction("absorb(address,address[])")).toBe("liquidate");
    expect(classifyAction("buyCollateral(address,uint256,uint256,address)")).toBe("liquidate");
    expect(classifyAction("refresh()")).toBe("other");
    expect(classifyAction(null)).toBe("other");
  });
});

describe("aggregateRecentActivity", () => {
  const now = Date.parse("2026-06-02T12:10:00Z");
  const txs: IndexerTx[] = [
    { hash: "0x1", method: "supply(address,uint256)", from: USER, to: COMET, origination: "ecdsa", timestamp: "2026-06-02T12:09:00Z" },
    { hash: "0x2", method: "withdraw(address,uint256)", from: USER, to: COMET, origination: "solana", timestamp: "2026-06-02T12:00:00Z" },
    { hash: "0x3", method: "refresh()", from: USER, to: COMET, origination: "ecdsa", timestamp: "2026-06-02T12:08:00Z" },
  ];
  const transfersByHash: Record<string, TransferEvent[]> = {
    "0x1": [t(SOL, USER, COMET, 2_000_000_000n)], // supply 2 wSOL (collateral in)
    "0x2": [t(BASE, COMET, USER, 1_500_000n)],     // withdraw 1.5 wUSDC (base out)
    "0x3": [],
  };

  it("builds recency-sorted rows for supply/withdraw, drops 'other', resolves symbol+amount+lane", () => {
    const rows = aggregateRecentActivity({ txs, transfersByHash, symbolByAddr, comet: COMET, nowMs: now });
    // refresh() dropped; supply + withdraw kept, newest first (0x1 @12:09 before 0x2 @12:00)
    expect(rows.map((r) => r.txHash)).toEqual(["0x1", "0x2"]);

    expect(rows[0]).toMatchObject({ action: "supply", asset: "wSOL", lane: "evm" });
    expect(rows[0].amount).toBeCloseTo(2, 9); // 2e9 / 1e9
    expect(rows[1]).toMatchObject({ action: "withdraw", asset: "wUSDC", lane: "sol" });
    expect(rows[1].amount).toBeCloseTo(1.5, 6);
  });

  it("formats age relative to now", () => {
    const rows = aggregateRecentActivity({ txs, transfersByHash, symbolByAddr, comet: COMET, nowMs: now });
    expect(rows[0].age).toBe("1m");  // 12:10 - 12:09
    expect(rows[1].age).toBe("10m"); // 12:10 - 12:00
  });

  it("caps at `limit`", () => {
    const rows = aggregateRecentActivity({ txs, transfersByHash, symbolByAddr, comet: COMET, nowMs: now, limit: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].txHash).toBe("0x1");
  });
});
