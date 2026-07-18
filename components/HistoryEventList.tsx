"use client";

// Day-grouped history feed. Same per-event row presentation as ActivityFeed
// but wrapped in DaySection components with sticky-ish headings ("Today",
// "Yesterday", "May 26") so a long list reads as a calendar.

import { formatUnits } from "viem";
import { TokenIcon } from "./ui/TokenIcon";
import { TxLink } from "./ui/TxLink";
import { fmtUSDC, relTime } from "./ui/format";
import { groupByDay, formatDayLabel } from "@/lib/portal/groupByDay";
import type { ActivityEntryTimed } from "@/lib/portal/groupByDay";
import { explorerTxUrl } from "@/lib/explorer";

export interface HistoryEventListProps {
  entries: ActivityEntryTimed[];
  /** Reference timestamp for "Today"/"Yesterday" computation. Defaults to wall clock. */
  referenceTs?: number;
  symbolByAsset: Record<string, string>;
  decimalsByAsset: Record<string, number>;
  baseSymbol: string;
  baseDecimals: number;
  explorerBase: string;
}

export function HistoryEventList({
  entries,
  referenceTs,
  symbolByAsset,
  decimalsByAsset,
  baseSymbol,
  baseDecimals,
  explorerBase,
}: HistoryEventListProps) {
  if (entries.length === 0) {
    return (
      <div
        style={{
          padding: "48px 24px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
          textAlign: "center",
          color: "var(--fg2)",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
        }}
      >
        No recent activity on this market.
      </div>
    );
  }

  const ref = referenceTs ?? Math.floor(Date.now() / 1000);
  const groups = groupByDay(entries);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {groups.map((g) => (
        <section key={g.dayStart}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontFamily: "var(--font-serif)",
                fontSize: 20,
                fontWeight: 400,
                color: "var(--fg1)",
              }}
            >
              {formatDayLabel(g.dayStart, ref)}
            </h3>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "var(--fg2)",
              }}
            >
              {g.entries.length} events
            </span>
          </div>
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {g.entries.map((entry, i) => (
              <EventRow
                key={`${entry.txHash}-${entry.logIndex}`}
                entry={entry}
                isLast={i === g.entries.length - 1}
                symbolByAsset={symbolByAsset}
                decimalsByAsset={decimalsByAsset}
                baseSymbol={baseSymbol}
                baseDecimals={baseDecimals}
                explorerBase={explorerBase}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

interface EventRowProps {
  entry: ActivityEntryTimed;
  isLast: boolean;
  symbolByAsset: Record<string, string>;
  decimalsByAsset: Record<string, number>;
  baseSymbol: string;
  baseDecimals: number;
  explorerBase: string;
}

function EventRow({
  entry,
  isLast,
  symbolByAsset,
  decimalsByAsset,
  baseSymbol,
  baseDecimals,
  explorerBase,
}: EventRowProps) {
  const isCollat =
    entry.kind === "supplyCollateral" || entry.kind === "withdrawCollateral";
  const assetSymbol = isCollat
    ? symbolByAsset[entry.asset as string] ?? entry.asset.toString().slice(0, 8)
    : baseSymbol;
  const assetDecimals = isCollat
    ? decimalsByAsset[entry.asset as string] ?? 18
    : baseDecimals;
  const amt = fmtUSDC(Number(formatUnits(entry.amount, assetDecimals)), 4);
  const verb =
    entry.kind === "supply"
      ? `Supplied ${amt} ${assetSymbol}`
      : entry.kind === "withdraw"
        ? `Withdrew ${amt} ${assetSymbol}`
        : entry.kind === "supplyCollateral"
          ? `Supplied ${amt} ${assetSymbol} as collateral`
          : `Withdrew ${amt} ${assetSymbol} collateral`;
  const tone =
    entry.kind === "supply" || entry.kind === "supplyCollateral"
      ? "var(--hf-safe)"
      : "var(--hf-warn)";
  const txShort = `${entry.txHash.slice(0, 11)}…${entry.txHash.slice(-4)}`;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto auto 1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "14px 18px",
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: "var(--bg-surface-2)",
          color: tone,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
        }}
      >
        {entry.kind === "supply" || entry.kind === "supplyCollateral" ? "↓" : "↑"}
      </span>
      <TokenIcon symbol={assetSymbol} size={22} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg1)" }}>
          {verb}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg2)",
            letterSpacing: "0.04em",
          }}
        >
          {relTime(entry.timestamp * 1000)} ·{" "}
          <TxLink href={explorerTxUrl(explorerBase, entry.txHash)}>{txShort}</TxLink>
        </div>
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--fg2)",
        }}
      >
        #{entry.blockNumber.toString()}
      </div>
    </div>
  );
}
