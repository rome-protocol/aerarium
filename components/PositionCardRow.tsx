"use client";

// One row in the supply / collateral positions list.  Compound-v3-style
// card with token icon, balance, USD value, factor copy, and inline
// action buttons.

import { TokenIcon } from "./ui/TokenIcon";
import { Button } from "./ui/Button";
import { fmtUSD, fmtUSDC } from "./ui/format";
import { formatUnits } from "viem";

export interface PositionCardRowProps {
  symbol: string;
  /** Optional friendly long name ("Mock Collateral"). */
  longName?: string;
  /** Raw balance (smallest unit). */
  balance: bigint;
  decimals: number;
  /** USD value of the position. */
  valueUSD: number;
  /** APY for this row (decimal, e.g. 0.052 = 5.2%).  Undefined for collateral rows. */
  apyPct?: number;
  /** Optional row caption (e.g. "Borrow factor 75% · Liquidation 85%"). */
  caption?: string;
  /** Inline actions (callbacks fired when user clicks). */
  onPrimaryAction?: () => void;
  primaryLabel?: string;
  onSecondaryAction?: () => void;
  secondaryLabel?: string;
}

export function PositionCardRow({
  symbol,
  longName,
  balance,
  decimals,
  valueUSD,
  apyPct,
  caption,
  onPrimaryAction,
  primaryLabel,
  onSecondaryAction,
  secondaryLabel,
}: PositionCardRowProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 16,
        alignItems: "center",
        padding: "14px 16px",
        background: "var(--bg-page)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 10,
      }}
    >
      <TokenIcon symbol={symbol} size={32} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <strong style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg1)" }}>
            {symbol}
          </strong>
          {longName ? (
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg2)" }}>
              {longName}
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 16, fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg2)" }}>
          <span>
            <span style={{ color: "var(--fg1)" }}>{fmtUSDC(Number(formatUnits(balance, decimals)), 4)}</span>{" "}
            <span style={{ fontSize: 11, color: "var(--fg2)" }}>{symbol}</span>
          </span>
          <span>{fmtUSD(valueUSD)}</span>
          {apyPct !== undefined ? (
            <span>{(apyPct * 100).toFixed(2)}% APY</span>
          ) : null}
        </div>
        {caption ? (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.04em",
              color: "var(--fg2)",
              marginTop: 2,
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {onSecondaryAction && secondaryLabel ? (
          <Button variant="ghost" size="sm" onClick={onSecondaryAction}>
            {secondaryLabel}
          </Button>
        ) : null}
        {onPrimaryAction && primaryLabel ? (
          <Button variant="primary" size="sm" onClick={onPrimaryAction}>
            {primaryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
