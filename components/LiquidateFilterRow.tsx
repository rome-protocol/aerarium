"use client";

import type { ChangeEvent } from "react";

export interface FilterState {
  /** Show accounts with HF below this threshold. 1.0 = strictly liquidatable; 1.10 = situational awareness. */
  hfThreshold: number;
  /** Collateral asset symbol filter; null = any. */
  collateralSymbol: string | null;
  /** Debt asset symbol filter; null = any. Compound v3 only has one base asset, but the filter is plumbed for future. */
  debtSymbol: string | null;
  /** Minimum borrow size in USD to surface. Lets liquidators ignore dust. */
  minSizeUSD: number;
}

export interface LiquidateFilterRowProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
  collatSymbols: string[];
  debtSymbols: string[];
  /** Polling cadence in seconds, surfaced in the "Live · Ns tick" indicator. */
  liveSeconds: number;
}

// Dense, dark filter row sitting between the page hero and the borrower
// table. Mirrors the aave-demo pattern: each input is a soft outlined pill
// with a tiny uppercase label, and the Live tick indicator sits pinned to
// the right with a status dot so the page reads as a live data surface
// even when the table is empty.
export function LiquidateFilterRow({
  value,
  onChange,
  collatSymbols,
  debtSymbols,
  liveSeconds,
}: LiquidateFilterRowProps) {
  function patch(p: Partial<FilterState>) {
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
      <PillField label="HF">
        <select
          aria-label="HF threshold"
          value={value.hfThreshold.toString()}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            patch({ hfThreshold: Number(e.target.value) })
          }
          style={fieldInputStyle}
        >
          <option value="1">&lt; 1.00</option>
          <option value="1.05">&lt; 1.05</option>
          <option value="1.1">&lt; 1.10</option>
          <option value="1.25">&lt; 1.25</option>
        </select>
      </PillField>

      <PillField label="Collateral">
        <select
          aria-label="Collateral filter"
          value={value.collateralSymbol ?? ""}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            patch({ collateralSymbol: e.target.value || null })
          }
          style={fieldInputStyle}
        >
          <option value="">Any</option>
          {collatSymbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </PillField>

      <PillField label="Debt">
        <select
          aria-label="Debt filter"
          value={value.debtSymbol ?? ""}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            patch({ debtSymbol: e.target.value || null })
          }
          style={fieldInputStyle}
        >
          <option value="">Any</option>
          {debtSymbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </PillField>

      <PillField label="Min size $">
        <input
          aria-label="Minimum borrow size USD"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value.minSizeUSD || ""}
          placeholder="0"
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            patch({ minSizeUSD: Number(e.target.value) || 0 })
          }
          style={{ ...fieldInputStyle, width: 70 }}
        />
      </PillField>

      <div style={{ flex: 1 }} />

      <div
        aria-label={`Live update tick: ${liveSeconds} seconds`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px 6px 10px",
          borderRadius: 999,
          border: "1px solid var(--border-default)",
          background: "var(--bg-surface)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.08em",
          color: "var(--hf-safe)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: 7,
            background: "var(--hf-safe)",
            boxShadow: "0 0 6px var(--hf-safe)",
          }}
        />
        <span>Live · {liveSeconds}s tick</span>
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
