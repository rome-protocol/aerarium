"use client";

import type { ReserveStat } from "@/lib/portal/hooks/useReserveStats";
import { fmtPctNullable } from "./ui/format";
import { TokenIcon } from "./icons";
import { Button } from "./ui/Button";

const fmtAmount = (raw: bigint, decimals: number): string => {
  if (raw === 0n) return "0";
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const frac = raw % scale;
  if (frac === 0n) return whole.toString();
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .slice(0, 4)
    .replace(/0+$/, "");
  return fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
};

export interface AssetsToSupplyTableProps {
  reserves: ReserveStat[] | null;
  /** Map: lowercased asset address → raw balance bigint. Null = wallet not connected. */
  balances: Record<string, bigint> | null;
  symbolByAsset: Record<string, string>;
  decimalsByAsset: Record<string, number>;
  onSupply: (asset: string) => void;
}

export function AssetsToSupplyTable({
  reserves,
  balances,
  symbolByAsset,
  decimalsByAsset,
  onSupply,
}: AssetsToSupplyTableProps) {
  if (reserves === null) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading assets to supply"
        style={{ padding: 24, color: "var(--fg2)" }}
      >
        Loading assets…
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
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 20, marginBottom: 16 }}>
        Assets to supply
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th>Asset</Th>
            <Th>Wallet balance</Th>
            <Th>APY</Th>
            <Th>Can be collateral</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {reserves.map((r) => {
            const key = r.asset.toLowerCase();
            const sym = symbolByAsset[key] ?? `${r.asset.slice(0, 6)}…${r.asset.slice(-4)}`;
            const dec = decimalsByAsset[key] ?? r.decimals;
            const bal = balances?.[key] ?? 0n;
            const canBeCollat = r.borrowCollateralFactorPct > 0;
            return (
              <tr key={r.asset}>
                <Td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <TokenIcon symbol={sym} size={22} />
                    <span>{sym}</span>
                  </span>
                </Td>
                <Td>{fmtAmount(bal, dec)}</Td>
                <Td>{fmtPctNullable(r.supplyApyPct)}</Td>
                <Td>{canBeCollat ? "Yes" : "No"}</Td>
                <Td>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onSupply(r.asset)}
                    disabled={bal === 0n}
                  >
                    Supply
                  </Button>
                </Td>
              </tr>
            );
          })}
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
