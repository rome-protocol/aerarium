"use client";

import type { ChangeEvent } from "react";
import type { ActivityKind } from "@/lib/portal/activity";

export interface HistoryFilterState {
  /** Filter by event kind. null = all kinds. */
  kind: ActivityKind | null;
  /** Filter by asset symbol (wUSDC, wHEAT, …). null = any asset. */
  symbol: string | null;
}

export interface HistoryFilterRowProps {
  value: HistoryFilterState;
  onChange: (next: HistoryFilterState) => void;
  assetSymbols: string[];
  eventCount: number;
}

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "supply", label: "Supply" },
  { value: "withdraw", label: "Withdraw / Borrow" },
  { value: "supplyCollateral", label: "Supply collateral" },
  { value: "withdrawCollateral", label: "Withdraw collateral" },
];

// Dense filter row for /history. Same visual rhythm as the Liquidate page —
// soft-outlined pill fields, monospace labels — plus an event-count chip
// pinned right.
export function HistoryFilterRow({
  value,
  onChange,
  assetSymbols,
  eventCount,
}: HistoryFilterRowProps) {
  function patch(p: Partial<HistoryFilterState>) {
    onChange({ ...value, ...p });
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        padding: "14px 16px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
      }}
    >
      <PillField label="Type">
        <select
          aria-label="Type filter"
          value={value.kind ?? ""}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            patch({ kind: (e.target.value || null) as ActivityKind | null })
          }
          style={fieldInputStyle}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </PillField>

      <PillField label="Asset">
        <select
          aria-label="Asset filter"
          value={value.symbol ?? ""}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            patch({ symbol: e.target.value || null })
          }
          style={fieldInputStyle}
        >
          <option value="">Any</option>
          {assetSymbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </PillField>

      <div style={{ flex: 1 }} />

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.08em",
          color: "var(--fg2)",
        }}
      >
        {eventCount} events
      </div>
    </div>
  );
}

function PillField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        borderRadius: 999,
        border: "1px solid var(--border-default)",
        background: "var(--bg-surface)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--fg2)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const fieldInputStyle: React.CSSProperties = {
  appearance: "none",
  background: "transparent",
  border: "none",
  outline: "none",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--fg1)",
  padding: "2px 0",
};
