"use client";

import { TokenIcon } from "./icons";

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

export interface YourSuppliesTableProps {
  /** Comet base-asset supply position (comet.balanceOf(user)). */
  baseSupply: bigint;
  baseAsset: string;
  /** Map: lowercased collat address → comet.collateralBalanceOf(user, asset). */
  collatBalances: Record<string, bigint>;
  symbolByAsset: Record<string, string>;
  decimalsByAsset: Record<string, number>;
  onSupply: (asset: string) => void;
  onWithdraw: (asset: string) => void;
}

export function YourSuppliesTable({
  baseSupply,
  baseAsset,
  collatBalances,
  symbolByAsset,
  decimalsByAsset,
  onSupply,
  onWithdraw,
}: YourSuppliesTableProps) {
  const rows: { asset: string; balance: bigint }[] = [];
  if (baseSupply > 0n) {
    rows.push({ asset: baseAsset, balance: baseSupply });
  }
  for (const [asset, bal] of Object.entries(collatBalances)) {
    if (bal > 0n) rows.push({ asset, balance: bal });
  }

  const cardShell: React.CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 12,
    padding: 24,
  };

  if (rows.length === 0) {
    return (
      <div style={cardShell}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 20, marginBottom: 16 }}>
          Your supplies
        </h2>
        <div style={{ color: "var(--fg2)" }}>
          No supplies yet — supply your first asset from the panel below.
        </div>
      </div>
    );
  }

  return (
    <div style={cardShell}>
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 20, marginBottom: 16 }}>
        Your supplies
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th>Asset</Th>
            <Th>Balance</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = r.asset.toLowerCase();
            const sym = symbolByAsset[key] ?? `${r.asset.slice(0, 6)}…${r.asset.slice(-4)}`;
            const dec = decimalsByAsset[key] ?? 18;
            return (
              <tr key={r.asset}>
                <Td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <TokenIcon symbol={sym} size={22} />
                    <span>{sym}</span>
                  </span>
                </Td>
                <Td>{fmtAmount(r.balance, dec)}</Td>
                <Td>
                  <div style={{ display: "flex", gap: 8 }}>
                    <ActionBtn label="Supply" onClick={() => onSupply(r.asset)} />
                    <ActionBtn
                      label="Withdraw"
                      onClick={() => onWithdraw(r.asset)}
                      variant="ghost"
                    />
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  variant = "primary",
}: {
  label: string;
  onClick: () => void;
  variant?: "primary" | "ghost";
}) {
  return (
    <button
      onClick={onClick}
      style={{
        appearance: "none",
        background: variant === "ghost" ? "transparent" : "var(--accent)",
        color: variant === "ghost" ? "var(--fg1)" : "var(--accent-fg)",
        border: "1px solid var(--border-default)",
        borderRadius: 999,
        padding: "6px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th
      scope="col"
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
