"use client";
// PositionSummary card (Supplied / Borrowed / Net APR / Health + capacity bar).
// Ported from aer-app-lib.jsx.
import { eyebrow, num, fmt$ } from "./primitives";
import { resolveHealthDisplay } from "@/lib/lane/healthDisplay";

const Metric = ({ label, value, tone }: { label: string; value: string; tone: string }) => (
  <div>
    <div style={{ ...eyebrow, marginBottom: 8 }}>{label}</div>
    <div style={{ ...num, fontSize: 26, fontWeight: 600, color: tone, lineHeight: 1 }}>{value}</div>
  </div>
);

export const PositionSummary = ({ supplied, borrowed, capacity, healthFactor, netApr, empty, pricesStale }: {
  supplied: number; borrowed: number; capacity: number; healthFactor: number; netApr: number; empty: boolean;
  /** A held collateral's feed is stale — health is unknown only if you ALSO have
   *  debt. Shared rule with the Manage tab's HealthCapacity (resolveHealthDisplay). */
  pricesStale?: boolean;
}) => {
  const used = capacity > 0 ? Math.min(100, (borrowed / capacity) * 100) : 0;
  const hf = healthFactor;
  const hfColor = hf >= 2 ? "var(--pos)" : hf >= 1.25 ? "var(--gold-bright)" : "var(--oxblood-br)";
  const { showHealth } = resolveHealthDisplay({ borrowed, pricesStale }, empty);
  return (
    <div className="aer-card" style={{ padding: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <h2 className="aer-display" style={{ fontSize: 22, margin: 0, fontWeight: 400 }}>Your position</h2>
        <span style={{ ...eyebrow }}>Shared pool · Rome</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
        <Metric label="Supplied" value={empty ? "—" : fmt$(supplied)} tone="var(--marble)" />
        <Metric label="Borrowed" value={empty ? "—" : fmt$(borrowed)} tone="var(--marble)" />
        <Metric label="Net APR" value={empty ? "—" : (netApr >= 0 ? "+" : "") + netApr.toFixed(2) + "%"} tone="var(--gold-bright)" />
        <Metric label="Health" value={showHealth ? hf.toFixed(2) : "—"} tone={showHealth ? hfColor : "var(--marble-3)"} />
      </div>
      {!empty && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={eyebrow}>Borrow capacity used</span>
            <span style={{ ...num, fontSize: 12, color: "var(--marble-2)" }}>{fmt$(borrowed, 0)} / {fmt$(capacity, 0)}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "var(--paper)", overflow: "hidden", border: "1px solid var(--stone-line)" }}>
            <div style={{ height: "100%", width: used + "%", background: used > 85 ? "var(--oxblood-br)" : "linear-gradient(90deg, var(--lane-deep), var(--lane))", transition: "width 0.8s var(--ease)" }} />
          </div>
        </div>
      )}
    </div>
  );
};
