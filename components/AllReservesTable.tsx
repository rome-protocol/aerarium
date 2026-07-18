"use client";

import type { ReserveStat } from "@/lib/portal/hooks/useReserveStats";
import { fmtPctNullable, fmtUSDNullable } from "./ui/format";
import { TokenIcon } from "./icons";

const fmtAddrFallback = (addr: string): string =>
  `${addr.slice(0, 6)}…${addr.slice(-4)}`;

export interface AllReservesTableProps {
  reserves: ReserveStat[] | null;
  symbolByAsset: Record<string, string>;
}

export function AllReservesTable({ reserves, symbolByAsset }: AllReservesTableProps) {
  if (reserves === null) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading reserves"
        style={{ padding: 24, color: "var(--fg2)" }}
      >
        Loading reserves…
      </div>
    );
  }
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: 24,
      }}
    >
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 20, marginBottom: 16, fontWeight: 400 }}>
        All reserves
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th>Asset</Th>
            <Th align="right">Total supply</Th>
            <Th align="right">Supply APY</Th>
            <Th align="right">Total borrow</Th>
            <Th align="right">Borrow APY</Th>
            <Th align="right">Borrow CF</Th>
          </tr>
        </thead>
        <tbody>
          {reserves.map((r) => {
            const sym =
              symbolByAsset[r.asset.toLowerCase()] ?? fmtAddrFallback(r.asset);
            const qty = formatQty(r.totalSupplyRaw, r.decimals);
            const borrowQty = r.totalBorrowRaw !== null
              ? formatQty(r.totalBorrowRaw, r.decimals)
              : null;
            return (
              <tr key={r.asset}>
                <Td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <TokenIcon symbol={sym} size={22} />
                    <span>{sym}</span>
                  </span>
                </Td>
                <Td align="right">
                  <QtyCell qty={qty} usd={fmtUSDNullable(r.totalSupplyUSD)} />
                </Td>
                <Td align="right">
                  <ApyPill value={r.supplyApyPct} kind="supply" />
                </Td>
                <Td align="right">
                  <QtyCell
                    qty={borrowQty}
                    usd={r.totalBorrowUSD === null ? "—" : fmtUSDNullable(r.totalBorrowUSD)}
                  />
                </Td>
                <Td align="right">
                  <ApyPill value={r.borrowApyPct} kind="borrow" />
                </Td>
                <Td align="right">
                  {r.kind === "collateral"
                    ? `${r.borrowCollateralFactorPct.toFixed(0)}%`
                    : "—"}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Two-line cell: quantity above, USD below in muted secondary.
function QtyCell({ qty, usd }: { qty: string | null; usd: string }) {
  if (qty === null) {
    return <span style={{ color: "var(--fg2)" }}>—</span>;
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <span style={{ color: "var(--fg1)" }}>{qty}</span>
      <span style={{ color: "var(--fg2)", fontSize: 12 }}>{usd}</span>
    </span>
  );
}

// Colored APY rendered as a span so its hue surfaces in the DOM. Test reads
// the style attribute, so the var() call has to be on the span itself, not
// a parent.
function ApyPill({ value, kind }: { value: number | null; kind: "supply" | "borrow" }) {
  if (value === null) {
    return <span style={{ color: "var(--fg2)" }}>—</span>;
  }
  const color = kind === "supply" ? "var(--hf-safe)" : "var(--hf-warn)";
  return <span style={{ color }}>{fmtPctNullable(value)}</span>;
}

// Asset quantity using bigint math so we don't lose precision for large
// supplies on 18-decimal collats. Shows up to 4 fractional places, trims
// trailing zeros so "1.0000" reads as "1".
function formatQty(raw: bigint, decimals: number): string {
  if (raw === 0n) return "0";
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const frac = raw % scale;
  if (frac === 0n) {
    return whole.toLocaleString("en-US");
  }
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .slice(0, 4)
    .replace(/0+$/, "");
  return fracStr.length > 0
    ? `${whole.toLocaleString("en-US")}.${fracStr}`
    : whole.toLocaleString("en-US");
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "12px 8px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--fg2)",
        borderBottom: "1px solid var(--border-subtle)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <td
      style={{
        padding: "14px 8px",
        fontFamily: "var(--font-sans)",
        fontSize: 14,
        color: "var(--fg1)",
        borderBottom: "1px solid var(--border-dim, var(--border-subtle))",
        textAlign: align,
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}
