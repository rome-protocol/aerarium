"use client";
// AssetTable + AssetRow — the lane-home asset list. Click-to-SELECT: the whole
// row is the control (role=button, keyboard-operable); clicking it picks the
// asset, which drives the rail's SelectedAssetStats + ActionPanel. There is NO
// per-row action-button column anymore — all four actions (supply/withdraw/
// borrow/repay) live in the rail's ActionPanel, so per-row buttons were
// redundant and crowded the table. The active row is marked (aria-pressed +
// lane wash + left rule + chevron). NOTE: the dashboard's DashboardPositions is
// a different table that KEEPS action buttons (they deep-link; no adjacent panel
// there) — don't conflate the two.
import { useState } from "react";
import { eyebrow, num, fmtBalance, AssetIcon, short } from "./primitives";
import type { LaneAsset } from "./types";

const COLS = "1.7fr 1fr 1fr 1.2fr auto";

const AssetRow = ({ a, onSelect, active }: { a: LaneAsset; onSelect: (sym: string) => void; active: boolean }) => {
  const [h, setH] = useState(false);
  // Pick which balance to show by TOKEN amount (price-independent) so a stale
  // price feed (USD all 0) can't collapse a real supplied/borrowed balance to
  // "in wallet / —". fmtBalance then renders USD when known, else the token amt.
  const priceKnown = a.priceKnown !== false;
  const pick =
    a.suppliedTokens > 0
      ? { label: "supplied", usd: a.suppliedBal, tokens: a.suppliedTokens }
      : a.borrowedTokens > 0
        ? { label: "borrowed", usd: a.borrowedBal, tokens: a.borrowedTokens }
        : { label: "in wallet", usd: a.walletBal, tokens: a.walletTokens };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={() => onSelect(a.sym)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(a.sym);
        }
      }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "grid", gridTemplateColumns: COLS, gap: 14, alignItems: "center",
        padding: "16px 22px", borderBottom: "1px solid var(--stone-line)",
        background: active ? "var(--lane-wash)" : h ? "var(--paper)" : "transparent",
        borderLeft: "2px solid " + (active ? "var(--lane)" : "transparent"),
        cursor: "pointer", transition: "background var(--dur)", outline: "none",
        boxShadow: h && !active ? "inset 0 0 0 1px var(--stone-line-2)" : "none",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <AssetIcon sym={a.sym} tone={a.collateral ? "var(--lane)" : "var(--gold)"} />
        <span>
          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "var(--marble)" }}>{a.sym}</span>
          {/* On-chain identity underneath: EVM wrapper address on /evm, SPL mint
              on /solana. Canonical + unambiguous even before the symbol resolves. */}
          <span style={{ ...eyebrow, ...num, textTransform: "none", letterSpacing: 0, fontSize: 11 }} title={a.displayAddress ?? a.address}>{short(a.displayAddress ?? a.address ?? a.name)}</span>
        </span>
      </span>
      <span style={{ ...num, fontSize: 14, color: "var(--pos)", fontWeight: 600 }}>{a.supplyApy.toFixed(2)}%</span>
      <span style={{ ...num, fontSize: 14, color: a.borrowApy ? "var(--marble)" : "var(--marble-4)", fontWeight: 600 }}>{a.borrowApy ? a.borrowApy.toFixed(2) + "%" : "—"}</span>
      <span>
        <span style={{ ...num, display: "block", fontSize: 14, color: "var(--marble)" }}>{fmtBalance(pick.usd, pick.tokens, a.sym, priceKnown)}</span>
        {pick.tokens > 0 && <span style={{ ...eyebrow, textTransform: "none", letterSpacing: 0, fontSize: 11 }}>{pick.label}</span>}
      </span>
      {/* chevron affordance — the row is the control; this hints "selectable" and
          strengthens on hover/active. */}
      <span aria-hidden="true" style={{ justifySelf: "end", fontSize: 16, lineHeight: 1, color: active ? "var(--lane)" : h ? "var(--marble-3)" : "var(--marble-4)", transition: "color var(--dur)" }}>›</span>
    </div>
  );
};

export const AssetTable = ({ title, assets, onSelect, activeSym }: {
  title: string; assets: LaneAsset[]; onSelect: (sym: string) => void; activeSym: string;
}) => (
  <div className="aer-card" style={{ padding: "8px 0", overflow: "hidden" }}>
    <div style={{ padding: "16px 22px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <h3 className="aer-display" style={{ fontSize: 18, margin: 0, fontWeight: 400 }}>{title}</h3>
      <span style={{ ...eyebrow, color: "var(--marble-3)" }}>Select an asset to act</span>
    </div>
    <div style={{
      display: "grid", gridTemplateColumns: COLS, gap: 14, padding: "0 22px 10px",
      borderBottom: "1px solid var(--stone-line)", ...eyebrow,
    }}>
      <span>Asset</span><span>Supply APY</span><span>Borrow APY</span><span>Your balance</span><span></span>
    </div>
    {assets.map((a) => <AssetRow key={a.address ?? a.sym} a={a} onSelect={onSelect} active={a.sym === activeSym} />)}
  </div>
);
