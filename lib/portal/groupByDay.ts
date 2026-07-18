// Group activity entries into per-UTC-day buckets so the History page reads
// as a calendar rather than a flat list. Bucketing is by UTC day so the
// label matches the on-chain block timestamp irrespective of the viewer's
// timezone (matching what's stored in the registry / Solana transaction
// history).

import type { ActivityEntry } from "./activity";

export interface ActivityEntryTimed extends ActivityEntry {
  /** Block timestamp in unix seconds; fetched per unique block by the hook. */
  timestamp: number;
}

export interface DaySection {
  /** Start-of-day timestamp (00:00 UTC) — used for label formatting. */
  dayStart: number;
  entries: ActivityEntryTimed[];
}

function utcDayStart(ts: number): number {
  return Math.floor(ts / 86400) * 86400;
}

export function groupByDay(entries: ActivityEntryTimed[]): DaySection[] {
  if (entries.length === 0) return [];
  const groups: DaySection[] = [];
  let current: DaySection | null = null;
  for (const entry of entries) {
    const day = utcDayStart(entry.timestamp);
    if (current === null || current.dayStart !== day) {
      current = { dayStart: day, entries: [] };
      groups.push(current);
    }
    current.entries.push(entry);
  }
  return groups;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Returns "Today" / "Yesterday" / "May 26" relative to `referenceTs`. Caller
 * passes the current wall-clock time so the formatter stays deterministic for
 * tests (no implicit Date.now() reads).
 */
export function formatDayLabel(ts: number, referenceTs: number): string {
  const day = utcDayStart(ts);
  const refDay = utcDayStart(referenceTs);
  if (day === refDay) return "Today";
  if (day === refDay - 86400) return "Yesterday";
  const d = new Date(ts * 1000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
