// Tests for the pure lane-activity mapper (laneActivity.ts).
//
// toLaneActivity folds ActivityEntryTimed[] (from lib/portal/activity.ts's
// fetchRecentActivity) into the presentational ActivityItem[] the shared
// ActivityFeed renders — USD amount, verb, relative time, tx link. relativeTime
// buckets a unix timestamp against an injectable "now".

import { describe, it, expect } from "vitest";
import { relativeTime, toLaneActivity } from "../laneActivity";
import type { ActivityEntryTimed } from "@/lib/portal/groupByDay";

const WBTC = "0x1111111111111111111111111111111111111111";

// A lookup that knows base (wUSDC, 6dp, $1) + wBTC (8dp, $60k). Anything else
// returns undefined (the lookup-miss path).
const lookup = (asset: "base" | string) => {
  if (asset === "base") return { sym: "wUSDC", decimals: 6, priceUSDx8: 100_000_000n };
  if (asset === WBTC.toLowerCase()) return { sym: "wBTC", decimals: 8, priceUSDx8: 6_000_000_000_000n }; // $60,000 × 1e8
  return undefined;
};

function entry(over: Partial<ActivityEntryTimed>): ActivityEntryTimed {
  return {
    kind: "supply",
    asset: "base",
    amount: 0n,
    txHash: "0xdeadbeef" as `0x${string}`,
    blockNumber: 1000n,
    logIndex: 0,
    timestamp: 1_800_000_000,
    ...over,
  };
}

describe("relativeTime", () => {
  const now = 1_800_000_000;
  it("returns 'just now' for the current instant", () => {
    expect(relativeTime(now, now)).toBe("just now");
    expect(relativeTime(now - 30, now)).toBe("just now");
  });
  it("returns minutes for <1h", () => {
    expect(relativeTime(now - 5 * 60, now)).toBe("5m ago");
    expect(relativeTime(now - 59 * 60, now)).toBe("59m ago");
  });
  it("returns hours for <1d", () => {
    expect(relativeTime(now - 3 * 3600, now)).toBe("3h ago");
    expect(relativeTime(now - 23 * 3600, now)).toBe("23h ago");
  });
  it("returns days for <~7d", () => {
    expect(relativeTime(now - 2 * 86400, now)).toBe("2d ago");
    expect(relativeTime(now - 6 * 86400, now)).toBe("6d ago");
  });
  it("returns a 'DD Mon' calendar label beyond ~7d", () => {
    const out = relativeTime(now - 30 * 86400, now);
    expect(out).toMatch(/^\d{1,2}\s[A-Z][a-z]{2}$/); // e.g. "16 Dec"
  });
});

describe("toLaneActivity — base supply USD conversion", () => {
  it("converts a base supply to a USD amount + 'Supplied' verb", () => {
    const items = toLaneActivity(
      [entry({ kind: "supply", asset: "base", amount: 100n * 10n ** 6n, timestamp: 1_800_000_000 })],
      lookup,
      "https://explorer.example",
      { now: 1_800_000_000 },
    );
    expect(items).toHaveLength(1);
    expect(items[0].verb).toBe("Supplied");
    expect(items[0].amount).toBeCloseTo(100, 6); // 100 wUSDC × $1
    expect(items[0].sym).toBe("wUSDC");
  });
});

describe("toLaneActivity — collateral conversion", () => {
  it("converts a wBTC (8dp) collateral supply at $60k", () => {
    const items = toLaneActivity(
      [entry({ kind: "supplyCollateral", asset: WBTC.toLowerCase(), amount: 50_000_000n })], // 0.5 wBTC
      lookup,
      "https://explorer.example",
      { now: 1_800_000_000 },
    );
    expect(items[0].sym).toBe("wBTC");
    expect(items[0].amount).toBeCloseTo(30_000, 2); // 0.5 × $60,000
  });
});

describe("toLaneActivity — verb mapping for all four kinds", () => {
  it("maps supply / supplyCollateral → 'Supplied' and withdraw / withdrawCollateral → 'Withdrew'", () => {
    const items = toLaneActivity(
      [
        entry({ kind: "supply", asset: "base", amount: 1n, logIndex: 0 }),
        entry({ kind: "supplyCollateral", asset: WBTC.toLowerCase(), amount: 1n, logIndex: 1 }),
        entry({ kind: "withdraw", asset: "base", amount: 1n, logIndex: 2 }),
        entry({ kind: "withdrawCollateral", asset: WBTC.toLowerCase(), amount: 1n, logIndex: 3 }),
      ],
      lookup,
      "https://explorer.example",
      { now: 1_800_000_000 },
    );
    expect(items.map((i) => i.verb)).toEqual(["Supplied", "Supplied", "Withdrew", "Withdrew"]);
  });
});

describe("toLaneActivity — lookup miss", () => {
  it("falls back to amount 0 (no NaN) + a short asset label when the lookup misses", () => {
    const unknownAsset = "0x9999999999999999999999999999999999999999";
    const items = toLaneActivity(
      [entry({ kind: "supplyCollateral", asset: unknownAsset, amount: 123n })],
      lookup,
      "https://explorer.example",
      { now: 1_800_000_000 },
    );
    expect(items[0].amount).toBe(0);
    expect(Number.isNaN(items[0].amount)).toBe(false);
    expect(items[0].sym.length).toBeGreaterThan(0);
  });
});

describe("toLaneActivity — id + txUrl", () => {
  it("builds a stable id of txHash-logIndex", () => {
    const items = toLaneActivity(
      [entry({ txHash: "0xabc" as `0x${string}`, logIndex: 7 })],
      lookup,
      "https://explorer.example",
      { now: 1_800_000_000 },
    );
    expect(items[0].id).toBe("0xabc-7");
  });
  it("builds a tx URL when explorerBase is present", () => {
    const items = toLaneActivity(
      [entry({ txHash: "0xabc" as `0x${string}` })],
      lookup,
      "https://explorer.example/",
      { now: 1_800_000_000 },
    );
    expect(items[0].txUrl).toBe("https://explorer.example/tx/0xabc");
  });
  it("omits txUrl when explorerBase is empty", () => {
    const items = toLaneActivity(
      [entry({ txHash: "0xabc" as `0x${string}` })],
      lookup,
      "",
      { now: 1_800_000_000 },
    );
    expect(items[0].txUrl).toBeUndefined();
  });
});
