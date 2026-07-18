"use client";
// =====================================================================
// AERARIUM — SelectedAssetStats (lane-home rail, above the ActionPanel)
// The freed room from dropping the per-row action buttons + the big aggregate
// card buys space for richer per-asset context here: APYs, price, the user's
// wallet / supplied / borrowed balances for THIS asset, and the binding limit —
// available liquidity for the base (you can't borrow/withdraw base that isn't
// there), or supply-cap headroom for a collateral. Pure presentational over
// LaneAsset + position.limits; no chain reads.
// =====================================================================
import { eyebrow, num, fmt$, fmtBalance, AssetIcon } from "./primitives";
import type { LaneAsset, LanePosition } from "./types";

const fmtTok = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

const Stat = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13 }}>
    <span style={{ color: "var(--marble-2)" }}>{label}</span>
    <span style={{ ...num, fontWeight: 600, color: tone || "var(--marble)" }}>{value}</span>
  </div>
);

export function SelectedAssetStats({ asset, position }: { asset: LaneAsset; position: LanePosition }) {
  const liquidityUsd = position.limits?.availableLiquidityUsd;
  const priceKnown = asset.priceKnown !== false;
  return (
    <div className="aer-card" style={{ padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <AssetIcon sym={asset.sym} tone={asset.collateral ? "var(--lane)" : "var(--gold)"} size={28} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--marble)" }}>{asset.sym}</div>
          <div style={{ ...eyebrow, textTransform: "none", letterSpacing: 0, fontSize: 11.5 }}>{asset.name}</div>
        </div>
        {asset.collateral && (
          <span style={{ ...eyebrow, marginLeft: "auto", fontSize: 9.5, padding: "2px 8px", borderRadius: 999, background: "var(--lane-wash)", color: "var(--lane)", border: "1px solid var(--lane)" }}>collateral</span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Stat label="Supply APY" value={asset.supplyApy.toFixed(2) + "%"} tone="var(--pos)" />
        <Stat label="Borrow APY" value={asset.borrowApy ? asset.borrowApy.toFixed(2) + "%" : "—"} tone={asset.borrowApy ? "var(--marble)" : "var(--marble-4)"} />
        <Stat
          label="Price"
          value={priceKnown ? fmt$(asset.priceUsd ?? (asset.walletTokens > 0 ? asset.walletBal / asset.walletTokens : 1)) : "Unavailable"}
          tone={priceKnown ? undefined : "var(--marble-4)"}
        />

        <div style={{ height: 1, background: "var(--stone-line)", margin: "4px 0" }} />

        <Stat label="In wallet" value={fmtBalance(asset.walletBal, asset.walletTokens, asset.sym, priceKnown)} />
        <Stat label="Supplied" value={fmtBalance(asset.suppliedBal, asset.suppliedTokens, asset.sym, priceKnown)} />
        <Stat label="Borrowed" value={fmtBalance(asset.borrowedBal, asset.borrowedTokens, asset.sym, priceKnown)} />

        <div style={{ height: 1, background: "var(--stone-line)", margin: "4px 0" }} />

        {/* Binding limit — the constraint that bounds what you can do with this
            asset (mirrors the availableFor model). Base: available liquidity;
            collateral: supply-cap headroom. */}
        {asset.collateral ? (
          asset.supplyHeadroomTokens != null ? (
            <Stat label="Supply cap headroom" value={`${fmtTok(asset.supplyHeadroomTokens)} ${asset.sym}`} tone="var(--marble-2)" />
          ) : null
        ) : liquidityUsd != null ? (
          <Stat label="Available liquidity" value={fmt$(liquidityUsd)} tone="var(--marble-2)" />
        ) : null}
      </div>
    </div>
  );
}
