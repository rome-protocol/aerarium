import { describe, it, expect } from "vitest";
import { groupByDay, formatDayLabel } from "../groupByDay";
import type { ActivityEntry } from "../activity";

function mkEntry(ts: number, idx: number): ActivityEntry & { timestamp: number } {
  return {
    kind: "supply",
    asset: "base",
    amount: 1n,
    txHash: ("0x" + idx.toString(16).padStart(64, "0")) as `0x${string}`,
    blockNumber: BigInt(idx),
    logIndex: idx,
    timestamp: ts,
  };
}

describe("groupByDay", () => {
  it("returns an empty array when given no entries", () => {
    expect(groupByDay([])).toEqual([]);
  });

  it("groups entries within the same UTC day into a single section", () => {
    const t = 1779948000; // 2026-05-28 04:40 UTC
    const groups = groupByDay([mkEntry(t + 100, 1), mkEntry(t + 50, 2), mkEntry(t, 3)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(3);
  });

  it("splits entries from different UTC days into separate sections", () => {
    const today = 1779948000; // 2026-05-28
    const yesterday = today - 86400; // 2026-05-27
    const groups = groupByDay([mkEntry(today, 1), mkEntry(yesterday, 2)]);
    expect(groups).toHaveLength(2);
  });

  it("preserves input order (newest first) inside each group", () => {
    const t = 1779948000;
    const groups = groupByDay([mkEntry(t + 300, 1), mkEntry(t + 100, 2), mkEntry(t, 3)]);
    expect(groups[0].entries.map((e) => Number(e.blockNumber))).toEqual([1, 2, 3]);
  });
});

describe("formatDayLabel", () => {
  it("returns 'Today' for a timestamp in the same UTC day as the reference", () => {
    const ref = 1779948000; // 2026-05-28 04:40 UTC
    expect(formatDayLabel(ref, ref)).toBe("Today");
  });

  it("returns 'Yesterday' for a timestamp exactly one UTC day before the reference", () => {
    const ref = 1779948000;
    expect(formatDayLabel(ref - 86400, ref)).toBe("Yesterday");
  });

  it("returns a month-day label (e.g. 'May 26') for older timestamps", () => {
    const ref = 1779948000; // 2026-05-28
    const twoDaysBack = ref - 2 * 86400; // 2026-05-26
    const out = formatDayLabel(twoDaysBack, ref);
    expect(out).toMatch(/May\s+26/);
  });
});
