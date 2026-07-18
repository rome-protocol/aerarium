"use client";
// =====================================================================
// AERARIUM — DashboardPositions (read-first per-asset breakdown)
// The dedicated /evm/dashboard + /solana/dashboard pages render this BELOW the
// reused PositionSummary. Unlike the lane home's compact AssetTable (one
// balance per row + inline action buttons), this shows the user's full
// position per asset side-by-side — Supplied / Borrowed / In wallet — for every
// asset in the shared pool. Actions DEEP-LINK to the lane home's action surface
// via the injected actionHref, so the dashboard never re-hosts the ActionPanel
// (no duplicate action flow / no second source of truth). Pure presentational:
// it composes AssetIcon / fmt$ / Button over the adapter's LaneAsset[] — no new
// data plumbing. The page supplies actionHref (lane-aware: /evm?… or /solana?…).
// =====================================================================
import { Button } from "@/components/landing/primitives";
import { eyebrow, num, fmtBalance, AssetIcon, short } from "./primitives";
import type { LaneAsset, ActionType } from "./types";

export interface DashboardPositionsProps {
  assets: LaneAsset[];
  /** Deep-link to the lane home's action surface for (action, asset). */
  actionHref: (action: ActionType, sym: string) => string;
}

/** Balance cell: USD when the price is known, else the token amount (so supplied
 *  collateral stays visible when its feed is stale). `priceKnown !== false` so
 *  fixtures that predate the seam keep the USD presentation. */
const cell = (usd: number, tokens: number, a: LaneAsset) =>
  fmtBalance(usd, tokens, a.sym, a.priceKnown !== false);

export function DashboardPositions({ assets, actionHref }: DashboardPositionsProps) {
  return (
    <div className="aer-card" style={{ padding: "8px 0", overflow: "hidden" }}>
      <div style={{ padding: "16px 24px 12px" }}>
        <h3 className="aer-display" style={{ fontSize: 18, margin: 0, fontWeight: 400 }}>Your assets</h3>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr>
              <th style={thLeft}>Asset</th>
              <th style={thRight}>Supply APY</th>
              <th style={thRight}>Borrow APY</th>
              <th style={thRight}>Supplied</th>
              <th style={thRight}>Borrowed</th>
              <th style={thRight}>In wallet</th>
              <th style={thRight} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.address ?? a.sym} style={rowStyle}>
                <td style={tdLeft}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <AssetIcon sym={a.sym} tone={a.collateral ? "var(--lane)" : "var(--gold)"} />
                    <span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--marble)" }}>{a.sym}</span>
                        {a.collateral && <span style={collatTag}>collateral</span>}
                      </span>
                      <span style={{ ...eyebrow, ...num, textTransform: "none", letterSpacing: 0, fontSize: 11 }} title={a.displayAddress ?? a.address}>{short(a.displayAddress ?? a.address ?? a.name)}</span>
                    </span>
                  </div>
                </td>
                <td style={{ ...tdRight, color: "var(--pos)", fontWeight: 600 }}>{a.supplyApy.toFixed(2)}%</td>
                <td style={{ ...tdRight, color: a.borrowApy ? "var(--marble)" : "var(--marble-4)", fontWeight: 600 }}>
                  {a.borrowApy ? a.borrowApy.toFixed(2) + "%" : "—"}
                </td>
                <td style={tdRight}>{cell(a.suppliedBal, a.suppliedTokens, a)}</td>
                <td style={tdRight}>{cell(a.borrowedBal, a.borrowedTokens, a)}</td>
                <td style={tdRight}>{cell(a.walletBal, a.walletTokens, a)}</td>
                <td style={{ ...tdRight, whiteSpace: "nowrap" }}>
                  <span style={{ display: "inline-flex", gap: 8, justifyContent: "flex-end" }}>
                    <Button variant="outline" size="sm" href={actionHref("supply", a.sym)}>Supply</Button>
                    {a.borrowable ? (
                      <Button variant="gold" size="sm" href={actionHref("borrow", a.sym)}>Borrow</Button>
                    ) : (
                      <Button variant="ghost" size="sm" href={actionHref("withdraw", a.sym)}>Withdraw</Button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thBase: React.CSSProperties = {
  padding: "8px 16px",
  ...eyebrow,
  borderBottom: "1px solid var(--stone-line)",
  whiteSpace: "nowrap",
};
const thLeft: React.CSSProperties = { ...thBase, textAlign: "left" };
const thRight: React.CSSProperties = { ...thBase, textAlign: "right" };

const rowStyle: React.CSSProperties = { borderBottom: "1px solid var(--stone-line)" };
const tdLeft: React.CSSProperties = { padding: "16px", color: "var(--marble)", verticalAlign: "middle" };
const tdRight: React.CSSProperties = {
  padding: "16px",
  textAlign: "right",
  color: "var(--marble)",
  verticalAlign: "middle",
  ...num,
};

const collatTag: React.CSSProperties = {
  ...eyebrow,
  fontSize: 9.5,
  padding: "2px 7px",
  borderRadius: 999,
  background: "var(--lane-wash)",
  color: "var(--lane)",
  border: "1px solid var(--lane)",
};
