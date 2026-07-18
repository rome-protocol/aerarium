"use client";

// Recent activity feed — one card listing the user's recent
// Supply / Withdraw / SupplyCollateral / WithdrawCollateral events on
// the current Comet market.

import { formatUnits } from "viem";
import { Card } from "./ui/Card";
import { Eyebrow } from "./ui/Eyebrow";
import { TokenIcon } from "./ui/TokenIcon";
import { TxLink } from "./ui/TxLink";
import { fmtUSDC, relTime } from "./ui/format";
import { explorerTxUrl } from "@/lib/explorer";
import type { ActivityEntry } from "@/lib/portal/activity";

interface ActivityFeedProps {
  entries: ActivityEntry[];
  loading: boolean;
  /** Address → symbol map so we can render PCOL instead of 0x113A…  */
  symbolByAsset: Record<string, string>;
  /** Address → decimals map so we can format the raw amount. */
  decimalsByAsset: Record<string, number>;
  baseSymbol: string;
  baseDecimals: number;
  explorerBase: string;
}

export function ActivityFeed({
  entries,
  loading,
  symbolByAsset,
  decimalsByAsset,
  baseSymbol,
  baseDecimals,
  explorerBase,
}: ActivityFeedProps) {
  if (entries.length === 0) {
    return (
      <Card>
        <Eyebrow style={{ display: "block", marginBottom: 12 }}>Recent activity</Eyebrow>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg2)" }}>
          {loading ? "Loading…" : "No recent activity on this market."}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Eyebrow style={{ display: "block", marginBottom: 16 }}>Recent activity</Eyebrow>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {entries.map((entry, i) => {
          const isCollat =
            entry.kind === "supplyCollateral" || entry.kind === "withdrawCollateral";
          const assetSymbol = isCollat
            ? (symbolByAsset[entry.asset as string] ?? entry.asset.toString().slice(0, 8))
            : baseSymbol;
          const assetDecimals = isCollat
            ? (decimalsByAsset[entry.asset as string] ?? 18)
            : baseDecimals;
          const amt = fmtUSDC(Number(formatUnits(entry.amount, assetDecimals)), 4);

          const verb =
            entry.kind === "supply" ? `Supplied ${amt} ${assetSymbol}` :
            entry.kind === "withdraw" ? `Withdrew ${amt} ${assetSymbol}` :
            entry.kind === "supplyCollateral" ? `Supplied ${amt} ${assetSymbol} as collateral` :
            `Withdrew ${amt} ${assetSymbol} collateral`;

          const arrow =
            entry.kind === "supply" || entry.kind === "supplyCollateral" ? "↗" : "←";

          return (
            <div
              key={`${entry.txHash}-${entry.logIndex}`}
              style={{
                display: "grid",
                gridTemplateColumns: "auto auto 1fr auto",
                gap: 12,
                alignItems: "center",
                padding: "12px 0",
                borderBottom: i === entries.length - 1 ? "none" : "1px solid var(--border-subtle)",
              }}
            >
              <span style={{ fontSize: 16, color: "var(--fg2)", width: 18, textAlign: "center" }}>
                {arrow}
              </span>
              <TokenIcon symbol={assetSymbol} size={24} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg1)" }}>
                  {verb}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg2)", letterSpacing: "0.04em" }}>
                  block {entry.blockNumber.toString()} ·{" "}
                  <TxLink href={explorerTxUrl(explorerBase, entry.txHash)}>
                    {entry.txHash.slice(0, 10)}…{entry.txHash.slice(-4)}
                  </TxLink>
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg2)" }}>
                {/* Estimate time-ago from block height isn't trivial without timestamps; show block-rel. */}
                #{entry.blockNumber.toString()}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
