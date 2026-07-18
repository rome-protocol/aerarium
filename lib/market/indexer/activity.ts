// Pure aggregation of indexed comet txs (+ decoded Transfer logs) into a
// cross-lane recent-activity feed for the front page. The indexer is the only
// source that sees BOTH lanes — Solana-origin (DoTxUnsigned) actions never emit
// eth_getLogs — so this is what makes the landing's activity feed complete.

import type { IndexerTx } from "./client";
import type { TransferEvent } from "./decode";
import type { Side, ActivityAction, ActivityRow } from "../MarketSource";

export type { ActivityAction, ActivityRow };

/** Map a comet method name to a coarse user action. */
export function classifyAction(method: string | null | undefined): ActivityAction {
  const m = method ?? "";
  if (m.startsWith("supply")) return "supply";
  if (m.startsWith("withdraw")) return "withdraw";
  if (m.startsWith("absorb") || m.startsWith("buyCollateral")) return "liquidate";
  return "other";
}

function ageFrom(tsMs: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - tsMs) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

interface AggInput {
  txs: IndexerTx[];
  transfersByHash: Record<string, TransferEvent[]>;
  /** lowercased token address → { symbol, decimals } */
  symbolByAddr: Record<string, { symbol: string; decimals: number }>;
  comet: string;
  nowMs: number;
  limit?: number;
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Indexed txs → recency-sorted activity rows. Keeps supply / withdraw /
 * liquidate (drops refresh/approve/etc); resolves the comet-involved transfer's
 * token + amount; lane from origination. Pure — `nowMs` injected for age.
 */
export function aggregateRecentActivity(input: AggInput): ActivityRow[] {
  const { txs, transfersByHash, symbolByAddr, comet, nowMs, limit = 12 } = input;
  const rows: (ActivityRow & { tsMs: number })[] = [];

  for (const tx of txs) {
    const action = classifyAction(tx.method);
    if (action === "other") continue;
    const lane: Side = tx.origination === "ecdsa" ? "evm" : "sol";
    // The comet-involved transfer carries the moved asset + amount: supply moves
    // a token INTO the comet, withdraw moves the base OUT of it.
    const transfers = transfersByHash[tx.hash] ?? [];
    const primary =
      transfers.find((t) => eq(t.to, comet)) ?? transfers.find((t) => eq(t.from, comet)) ?? transfers[0];

    let asset = "—";
    let amount = 0;
    if (primary) {
      const meta = symbolByAddr[primary.token.toLowerCase()];
      if (meta) {
        asset = meta.symbol;
        amount = Number(primary.amount) / 10 ** meta.decimals;
      }
    }

    const tsMs = Date.parse(tx.timestamp) || 0;
    rows.push({ txHash: tx.hash, action, asset, amount, lane, age: ageFrom(tsMs, nowMs), illustrative: false, tsMs });
  }

  rows.sort((a, b) => b.tsMs - a.tsMs);
  return rows.slice(0, limit).map(({ tsMs: _tsMs, ...row }) => row);
}

export interface ArenaCounts {
  evm: number;
  sol: number;
}

/** Count historical liquidation txs (absorb / buyCollateral) per lane. */
export function aggregateArenaCounts(txs: IndexerTx[]): ArenaCounts {
  let evm = 0;
  let sol = 0;
  for (const tx of txs) {
    if (classifyAction(tx.method) !== "liquidate") continue;
    if (tx.origination === "ecdsa") evm += 1;
    else sol += 1;
  }
  return { evm, sol };
}
