"use client";

import { fmtUSDCompact } from "./ui/format";

export interface MarketStatStripProps {
  marketName: string;
  chainId: number;
  totalSupplyUSD: number | null;
  availableUSD: number | null;
  totalBorrowUSD: number | null;
}

// Top-of-Markets stat strip — pairs the page-level hero with the data anchor
// (Total Supply / Available / Total Borrow) that Aave-style markets pages
// surface. Keeps the chain id pinned to the right as a meta annotation so
// users on a connected wallet can verify they're on the chain they expect.
export function MarketStatStrip({
  marketName,
  chainId,
  totalSupplyUSD,
  availableUSD,
  totalBorrowUSD,
}: MarketStatStripProps) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: 24,
        display: "flex",
        alignItems: "flex-end",
        gap: 48,
        flexWrap: "wrap",
      }}
    >
      <Cell label="Market" value={marketName} mono={false} />
      <Cell label="Total supply" value={fmtUSDCompact(totalSupplyUSD)} />
      <Cell label="Available" value={fmtUSDCompact(availableUSD)} />
      <Cell label="Total borrow" value={fmtUSDCompact(totalBorrowUSD)} />
      <div style={{ flex: 1 }} />
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.08em",
          color: "var(--fg2)",
        }}
      >
        {marketName} · {chainId}
      </div>
    </div>
  );
}

function Cell({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--fg2)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: mono ? "var(--font-serif)" : "var(--font-serif)",
          fontSize: 28,
          fontWeight: 400,
          color: "var(--fg1)",
          letterSpacing: "-0.01em",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}
