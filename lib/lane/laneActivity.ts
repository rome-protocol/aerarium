// Pure mapping from on-chain Comet activity (ActivityEntryTimed[], produced by
// lib/portal/activity.ts's fetchRecentActivity) into the presentational
// ActivityItem[] the shared lane ActivityFeed renders.
//
// Async-free / client-free so it's unit-testable in isolation (mirrors
// mapEvmPosition / mapSolanaPosition). Both lanes call this with the same
// ActivityEntryTimed[] but a lane-specific `lookup` (EVM lane builds it from its
// reserve/position reads; Solana lane from its assetMetas/reads) — the only
// thing that differs between lanes is how the per-asset {sym, decimals, price}
// is sourced, and that's exactly what `lookup` abstracts.
//
// USD convention (same as the position mappers): the `amount` on each
// ActivityItem is a USD number; the presentational layer formats with fmt$.

import type { ActivityEntryTimed } from "@/lib/portal/groupByDay";
import type { ActivityEntry } from "@/lib/portal/activity";
import { explorerTxUrl } from "@/lib/explorer";
import type { ActionType, ActivityItem } from "@/components/aerarium/lane/types";

const PRICE_SCALE = 1e8;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Per-asset display info the mapper needs to convert a raw amount to USD. */
export interface AssetActivityInfo {
  sym: string;
  decimals: number;
  /** 1e8-scaled USD price (base ≈ 1e8; collats from the Comet price feed). */
  priceUSDx8: bigint;
}

/** A lookup keyed by "base" (the Comet base asset) or a lowercased asset
 *  address (collateral). Returns undefined for unknown assets. */
export type AssetLookup = (asset: "base" | string) => AssetActivityInfo | undefined;

/**
 * Human-relative time for a unix-seconds timestamp:
 *   <1m → "just now", <1h → "Nm ago", <1d → "Nh ago", <7d → "Nd ago",
 *   otherwise a "DD Mon" calendar label. `nowSeconds` is injectable for tests
 *   (defaults to wall-clock).
 */
export function relativeTime(tsSeconds: number, nowSeconds?: number): string {
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  const diff = now - tsSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  const d = new Date(tsSeconds * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function verbFor(kind: ActivityEntry["kind"]): string {
  return kind === "supply" || kind === "supplyCollateral" ? "Supplied" : "Withdrew";
}

function rawToUSD(raw: bigint, decimals: number, priceUSDx8: bigint): number {
  if (raw === 0n || priceUSDx8 === 0n) return 0;
  return (Number(raw) / 10 ** decimals) * (Number(priceUSDx8) / PRICE_SCALE);
}

/** Short fallback label for an asset the lookup doesn't know (truncated addr). */
function shortAssetLabel(asset: "base" | string): string {
  if (asset === "base") return "base";
  return asset.length > 10 ? `${asset.slice(0, 6)}…${asset.slice(-4)}` : asset;
}

/**
 * Fold timed activity entries into the designer's ActivityItem[].
 *   - verb: supply|supplyCollateral → "Supplied"; withdraw|withdrawCollateral → "Withdrew"
 *   - amount (USD): rawAmount/10**decimals × priceUSDx8/1e8 from the lookup;
 *     lookup-miss → amount 0 (never NaN) + a short asset label as sym
 *   - sym: from the lookup
 *   - id: `${txHash}-${logIndex}` (stable across re-fetches)
 *   - time: relativeTime(timestamp)
 *   - txUrl: explorerTxUrl(explorerBase, txHash) when explorerBase is non-empty
 */
export function toLaneActivity(
  entries: ActivityEntryTimed[],
  lookup: AssetLookup,
  explorerBase: string,
  opts?: { now?: number },
): ActivityItem[] {
  const now = opts?.now;
  return entries.map((e) => {
    const info = lookup(e.asset);
    const amount = info ? rawToUSD(e.amount, info.decimals, info.priceUSDx8) : 0;
    const sym = info?.sym ?? shortAssetLabel(e.asset);
    return {
      id: `${e.txHash}-${e.logIndex}`,
      time: relativeTime(e.timestamp, now),
      verb: verbFor(e.kind),
      amount,
      sym,
      txUrl: explorerBase ? explorerTxUrl(explorerBase, e.txHash) : undefined,
    };
  });
}

/** Past-tense verb for a just-submitted lane action. The activity feed reads in
 *  the past tense ("Supplied 100 wUSDC"); ActivityEntry only ever carries
 *  supply/withdraw kinds, so borrow/repay need their own mapping here. */
const OPTIMISTIC_VERB: Record<ActionType, string> = {
  supply: "Supplied",
  withdraw: "Withdrew",
  borrow: "Borrowed",
  repay: "Repaid",
};

/**
 * Build the presentational ActivityItem for an action the user JUST completed —
 * the optimistic row the adapter prepends the instant a submit succeeds. This is
 * the structural fix for two operator-reported gaps:
 *   - "no confirmation of any action" — the adapter now owns a record of the
 *     success it just produced, so LaneApp can render a confirmation from it.
 *   - "no recent activities show" on the Solana lane — Rome doesn't surface
 *     DoTxUnsigned events via eth_getLogs, so the fetched feed is empty there;
 *     the adapter (the action's lifecycle owner) supplies the row instead.
 *
 * Pure / client-free (mirrors toLaneActivity) so it's unit-testable. The caller
 * passes the USD amount it already computed (amountTokens × priceUsd) and the
 * explorer tx/sig URL it already produced — this only shapes them into a row.
 *   - verb: from `type` (supply→Supplied, withdraw→Withdrew, borrow→Borrowed,
 *     repay→Repaid)
 *   - id: `optimistic-${nowMs}` (namespaced so it never collides with a
 *     `${txHash}-${logIndex}` fetched id; nowMs makes rapid actions distinct)
 *   - time: always "just now"
 *   - amount: the USD number (formatted with fmt$ by the presentational layer)
 */
export function optimisticEntry(input: {
  type: ActionType;
  amountUsd: number;
  sym: string;
  txUrl?: string;
  nowMs?: number;
}): ActivityItem {
  const nowMs = input.nowMs ?? Date.now();
  return {
    id: `optimistic-${nowMs}`,
    time: "just now",
    verb: OPTIMISTIC_VERB[input.type],
    amount: input.amountUsd,
    sym: input.sym,
    txUrl: input.txUrl,
  };
}

/**
 * Merge the adapter's own optimistic entries (first, most-recent-first) with the
 * fetched on-chain feed for the activity list. De-dupes by id — once the EVM log
 * feed surfaces a row the adapter already recorded optimistically, the optimistic
 * one wins (it sorts first and the fetched dup is dropped). Optimistic ids are
 * `optimistic-*` and fetched ids are `${txHash}-${logIndex}`, so in practice
 * collisions only happen across the SAME source; the de-dupe still guards it.
 * Pure. Caller passes the cap (default 10).
 */
export function mergeActivity(
  optimistic: ActivityItem[],
  fetched: ActivityItem[],
  cap = 10,
): ActivityItem[] {
  const seen = new Set<string>();
  const out: ActivityItem[] = [];
  for (const item of [...optimistic, ...fetched]) {
    const key = String(item.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}
