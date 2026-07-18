"use client";
// =====================================================================
// AERARIUM — HealthCapacity (elevated lane-home risk readout)
// Replaces the big 4-metric PositionSummary card on the lane home (the action
// surface). The full aggregate (Supplied / Borrowed / Net APR + all assets) is
// the DASHBOARD's job now; here we highlight only what's decision-relevant
// WHILE you act:
//   - Health factor + a risk band (Safe ≥2 / Caution 1.25–2 / At-risk <1.25)
//   - Available to borrow $ — the actionable number, straight from the
//     availableFor min-of-constraints model (capacity ∧ liquidity ∧ baseMin)
//   - Borrow capacity used (borrowed / capacity) + a bar
// Prominent full-width strip so risk is never out of sight on the action page.
// =====================================================================
import { eyebrow, num, fmt$ } from "./primitives";
import { availableFor } from "@/lib/lane/laneActions";
import { resolveHealthDisplay } from "@/lib/lane/healthDisplay";
import type { LaneAsset, LanePosition } from "./types";

function band(hf: number): { label: string; color: string } {
  if (hf >= 2) return { label: "Safe", color: "var(--pos)" };
  if (hf >= 1.25) return { label: "Caution", color: "var(--gold-bright)" };
  return { label: "At risk", color: "var(--oxblood-br)" };
}

export function HealthCapacity({ position, baseAsset, empty }: {
  position: LanePosition;
  /** The borrowable (base) asset — used to compute available-to-borrow via
   *  availableFor. Optional: falls back to the raw capacity headroom. */
  baseAsset?: LaneAsset;
  empty: boolean;
}) {
  const hf = position.healthFactor;
  const b = band(hf);
  // One shared rule (resolveHealthDisplay) so this Manage widget and the
  // dashboard's PositionSummary agree under a stale feed: show health UNLESS
  // prices are stale AND there's debt; show borrow-capacity only when prices are
  // fresh. With $0 borrowed you can't be liquidated → health is safe even under
  // a stale feed, so don't blank it (the old code over-blanked on any stale feed).
  const { showHealth, showCapacity, stale } = resolveHealthDisplay(position, empty);
  const used = position.capacity > 0 ? Math.min(100, (position.borrowed / position.capacity) * 100) : 0;
  const availToBorrow = baseAsset
    ? availableFor({ type: "borrow", asset: baseAsset, position }).usd
    : Math.max(0, position.capacity - position.borrowed);

  return (
    <div className="aer-card" style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h2 className="aer-display" style={{ fontSize: 18, margin: 0, fontWeight: 400 }}>Account health</h2>
        <span style={{ ...eyebrow }}>{stale ? "Prices updating · Rome" : "Shared pool · Rome"}</span>
      </div>

      {stale && (
        <div style={{ ...eyebrow, textTransform: "none", letterSpacing: 0, fontSize: 12, color: "var(--marble-2)", marginBottom: 14 }}>
          A price feed is updating — your account values are temporarily unavailable and will refresh shortly.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 28, alignItems: "center" }}>
        {/* Health factor + risk band */}
        <div>
          <div style={{ ...eyebrow, marginBottom: 8 }}>Health factor</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ ...num, fontSize: 30, fontWeight: 600, lineHeight: 1, color: showHealth ? b.color : "var(--marble-3)" }}>
              {showHealth ? hf.toFixed(2) : "—"}
            </span>
            {showHealth ? (
              <span style={{
                ...eyebrow, fontSize: 10.5, padding: "3px 9px", borderRadius: 999,
                background: "color-mix(in srgb, " + b.color + " 14%, transparent)", color: b.color,
                border: "1px solid " + b.color,
              }}>{b.label}</span>
            ) : stale ? (
              <span style={{
                ...eyebrow, fontSize: 10.5, padding: "3px 9px", borderRadius: 999,
                background: "var(--paper)", color: "var(--marble-2)", border: "1px solid var(--stone-line-2)",
              }}>Prices updating</span>
            ) : null}
          </div>
        </div>

        {/* Available to borrow — the actionable number */}
        <div>
          <div style={{ ...eyebrow, marginBottom: 8 }}>Available to borrow</div>
          <span style={{ ...num, fontSize: 30, fontWeight: 600, lineHeight: 1, color: showCapacity ? "var(--gold-bright)" : "var(--marble-3)" }}>
            {showCapacity ? fmt$(availToBorrow) : "—"}
          </span>
        </div>

        {/* Capacity used + bar */}
        <div style={{ minWidth: 200 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={eyebrow}>Capacity used</span>
            <span style={{ ...num, fontSize: 12, color: "var(--marble-2)" }}>
              {showCapacity ? <>{fmt$(position.borrowed, 0)} / {fmt$(position.capacity, 0)}</> : "—"}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "var(--paper)", overflow: "hidden", border: "1px solid var(--stone-line)" }}>
            <div style={{ height: "100%", width: (showCapacity ? used : 0) + "%", background: used > 85 ? "var(--oxblood-br)" : "linear-gradient(90deg, var(--lane-deep), var(--lane))", transition: "width 0.8s var(--ease)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
