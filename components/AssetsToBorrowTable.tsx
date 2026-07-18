"use client";

import type { ReserveStat } from "@/lib/portal/hooks/useReserveStats";
import { fmtUSDNullable, fmtPctNullable } from "./ui/format";
import { TokenIcon } from "./icons";
import { Button } from "./ui/Button";

export interface AssetsToBorrowTableProps {
  reserves: ReserveStat[] | null;
  symbolByAsset: Record<string, string>;
  onBorrow: (asset: string) => void;
  /** Disables the Borrow button (e.g., when wallet is not connected). */
  disabled?: boolean;
}

export function AssetsToBorrowTable({ reserves, symbolByAsset, onBorrow, disabled = false }: AssetsToBorrowTableProps) {
  if (reserves === null) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading assets to borrow"
        style={{ padding: 24, color: "var(--fg2)" }}
      >
        Loading…
      </div>
    );
  }
  const baseRow = reserves.find((r) => r.kind === "base");
  if (!baseRow) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
          padding: 24,
          color: "var(--fg2)",
        }}
      >
        No base asset in market.
      </div>
    );
  }
  const available = baseRow.totalSupplyUSD - (baseRow.totalBorrowUSD ?? 0);
  const key = baseRow.asset.toLowerCase();
  const sym = symbolByAsset[key] ?? `${baseRow.asset.slice(0, 6)}…${baseRow.asset.slice(-4)}`;
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: 24,
      }}
    >
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 20, marginBottom: 16 }}>
        Assets to borrow
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th>Asset</Th>
            <Th>Available</Th>
            <Th>APY (variable)</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <TokenIcon symbol={sym} size={22} />
                    <span>{sym}</span>
                  </span>
                </Td>
            <Td>{fmtUSDNullable(available)}</Td>
            <Td>{fmtPctNullable(baseRow.borrowApyPct)}</Td>
            <Td>
              <Button variant="primary" size="sm" onClick={() => onBorrow(baseRow.asset)} disabled={disabled}>
                Borrow
              </Button>
            </Td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "12px 8px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--fg2)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
      scope="col"
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: "14px 8px",
        fontFamily: "var(--font-sans)",
        fontSize: 14,
        color: "var(--fg1)",
        borderBottom: "1px solid var(--border-dim, var(--border-subtle))",
      }}
    >
      {children}
    </td>
  );
}
