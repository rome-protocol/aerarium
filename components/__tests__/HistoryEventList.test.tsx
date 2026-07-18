// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryEventList } from "../HistoryEventList";
import type { ActivityEntryTimed } from "@/lib/portal/groupByDay";

function mkEntry(p: Partial<ActivityEntryTimed> & { ts: number; idx: number }): ActivityEntryTimed {
  return {
    kind: "supply",
    asset: "base",
    amount: 1_000_000n,
    txHash: ("0x" + p.idx.toString(16).padStart(64, "0")) as `0x${string}`,
    blockNumber: BigInt(p.idx),
    logIndex: p.idx,
    timestamp: p.ts,
    ...p,
  };
}

const symbolByAsset = { "0xaa": "wHEAT" };
const decimalsByAsset = { "0xaa": 18 };

describe("HistoryEventList", () => {
  it("renders an empty-state when entries are empty", () => {
    render(
      <HistoryEventList
        entries={[]}
        referenceTs={1779948000}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        baseSymbol="wUSDC"
        baseDecimals={6}
        explorerBase="https://example/"
      />,
    );
    expect(screen.getByText(/no.+activity/i)).toBeInTheDocument();
  });

  it("renders a day-section heading for each unique UTC day", () => {
    const today = 1779948000; // 2026-05-28
    render(
      <HistoryEventList
        entries={[
          mkEntry({ ts: today, idx: 1 }),
          mkEntry({ ts: today - 86400, idx: 2 }),
          mkEntry({ ts: today - 2 * 86400, idx: 3 }),
        ]}
        referenceTs={today}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        baseSymbol="wUSDC"
        baseDecimals={6}
        explorerBase="https://example/"
      />,
    );
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText(/May\s+26/)).toBeInTheDocument();
  });

  it("groups entries from the same day under a single section heading", () => {
    const today = 1779948000;
    render(
      <HistoryEventList
        entries={[
          mkEntry({ ts: today + 100, idx: 1 }),
          mkEntry({ ts: today, idx: 2 }),
        ]}
        referenceTs={today + 500}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        baseSymbol="wUSDC"
        baseDecimals={6}
        explorerBase="https://example/"
      />,
    );
    // One "Today" section, two rows inside it
    expect(screen.getAllByText("Today")).toHaveLength(1);
    // tx-hash short renders for each entry
    expect(screen.getByText(/0x000000000…0001/i)).toBeInTheDocument();
    expect(screen.getByText(/0x000000000…0002/i)).toBeInTheDocument();
  });

  it("renders the per-section event count chip", () => {
    const today = 1779948000;
    render(
      <HistoryEventList
        entries={[
          mkEntry({ ts: today, idx: 1 }),
          mkEntry({ ts: today, idx: 2 }),
        ]}
        referenceTs={today}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        baseSymbol="wUSDC"
        baseDecimals={6}
        explorerBase="https://example/"
      />,
    );
    expect(screen.getByText(/2\s+events/i)).toBeInTheDocument();
  });
});
