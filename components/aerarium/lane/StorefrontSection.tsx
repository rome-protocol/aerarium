"use client";
// =====================================================================
// AERARIUM — StorefrontSection (read-only "seized collateral for sale")
// Rendered on the dashboard below the per-asset breakdown. Surfaces the
// buyCollateral opportunity — which seized collateral the protocol holds for
// sale (post-liquidation), at the storeFront discount — WITHOUT the live buy
// action. buyCollateral reverts NotForSale until a real absorb seeds reserves,
// so the live buy (Solana reuse + a new EVM wire) is a funded follow-up that
// can only be exercised/verified after a liquidation. Empty-state is the common
// case (nothing seized). Data comes from lib/portal/storefront.fetchStorefront.
// =====================================================================
import { eyebrow, num, AssetIcon } from "./primitives";
import type { Storefront } from "@/lib/portal/storefront";

const fmtTokens = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 6 });

export interface StorefrontSectionProps {
  storefront: Storefront | null;
  loading: boolean;
}

export function StorefrontSection({ storefront, loading }: StorefrontSectionProps) {
  const items = storefront?.open ? storefront.items : [];
  const showEmpty = !loading && items.length === 0;

  return (
    <div className="aer-card" style={{ padding: "8px 0", overflow: "hidden" }}>
      <div style={{ padding: "16px 24px 12px" }}>
        <h3 className="aer-display" style={{ fontSize: 18, margin: 0, fontWeight: 400 }}>Seized collateral for sale</h3>
      </div>

      {loading ? (
        <div role="status" aria-busy="true" style={{ padding: "8px 24px 18px", fontSize: 13.5, color: "var(--marble-2)" }}>
          Checking the storefront…
        </div>
      ) : showEmpty ? (
        <p style={{ padding: "0 24px 18px", margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--marble-2)" }}>
          No seized collateral for sale right now — the storefront opens after a liquidation (<code>absorb</code>),
          when the protocol sells the seized collateral at a discount to refill its reserves.
        </p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr>
                  <th style={thLeft}>Collateral</th>
                  <th style={thRight}>Available</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.asset} style={{ borderBottom: "1px solid var(--stone-line)" }}>
                    <td style={{ padding: "14px 16px", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <AssetIcon sym={it.symbol} tone="var(--lane)" />
                        <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--marble)" }}>{it.symbol}</span>
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right", verticalAlign: "middle", ...num }}>
                      {fmtTokens(it.availableTokens)} {it.symbol}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ padding: "14px 24px 18px", margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--marble-2)" }}>
            <span aria-hidden="true" style={{ marginRight: 6, color: "var(--marble-3)" }}>ⓘ</span>
            Buyable at the storeFront discount via <code>buyCollateral</code> — the discount is the reward.
            Buying from here is coming next; today it runs through the liquidate flow.
          </p>
        </>
      )}
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
