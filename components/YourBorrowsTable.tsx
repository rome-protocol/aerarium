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

export interface YourBorrowsTableProps {
  /** Comet borrow balance for the connected user (comet.borrowBalanceOf(user)). */
  borrowBalance: bigint;
  baseAsset: string;
  symbolByAsset: Record<string, string>;
  decimalsByAsset: Record<string, number>;
  onRepay: (asset: string) => void;
  onBorrow: (asset: string) => void;
}

export function YourBorrowsTable({
  borrowBalance,
  baseAsset,
  symbolByAsset,
  decimalsByAsset,
  onRepay,
  onBorrow,
}: YourBorrowsTableProps) {
  const cardShell: React.CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 12,
    padding: 24,
  };
  if (borrowBalance === 0n) {
    return (
      <div style={cardShell}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 20, marginBottom: 16 }}>
          Your borrows
        </h2>
        <div style={{ color: "var(--fg2)" }}>
          No debt yet — borrow against your collateral from the panel below.
        </div>
      </div>
    );
  }
  const key = baseAsset.toLowerCase();
  const sym = symbolByAsset[key] ?? `${baseAsset.slice(0, 6)}…${baseAsset.slice(-4)}`;
  const dec = decimalsByAsset[key] ?? 18;
  return (
    <div style={cardShell}>
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 20, marginBottom: 16 }}>
        Your borrows
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th>Asset</Th>
            <Th>Debt</Th>
            <Th>Mode</Th>
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
            <Td>{fmtAmount(borrowBalance, dec)}</Td>
            <Td>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 10px",
                  borderRadius: 999,
                  background: "var(--bg-page)",
                  border: "1px solid var(--border-subtle)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--fg2)",
                }}
              >
                Variable
              </span>
            </Td>
            <Td>
              <div style={{ display: "flex", gap: 8 }}>
                <ActionBtn label="Repay" onClick={() => onRepay(baseAsset)} />
                <ActionBtn label="Borrow more" onClick={() => onBorrow(baseAsset)} variant="ghost" />
              </div>
            </Td>
          </tr>
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
