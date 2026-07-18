"use client";
// =====================================================================
// AERARIUM landing — MARKETS (read-only rates table)
// Ported from design/aer-sections2.jsx. Reads MarketRow[] from MarketSource.
// =====================================================================
import { useState } from "react";
import type { MarketRow } from "@/lib/market/MarketSource";
import { Section, SectionHead, ChainGlyph } from "./primitives";
import { fmtCompact } from "./tokens";

const MarketTableRow = ({ m, last }: { m: MarketRow; last: boolean }) => {
  const [h, setH] = useState(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1.2fr 1fr 1fr", gap: 16, alignItems: "center",
      padding: "18px 24px", borderBottom: last ? "none" : "1px solid var(--stone-line)",
      background: h ? "rgba(244,238,226,0.03)" : "transparent", transition: "background var(--dur)",
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{
          width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--stone-line-2)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--marble-2)", flexShrink: 0,
        }}>{m.asset.slice(0, 2)}</span>
        <span>
          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "var(--marble)" }}>{m.asset}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--marble-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {m.kind}{m.collateralFactorPct != null ? ` · ${m.collateralFactorPct.toFixed(0)}% max LTV` : ""}
          </span>
        </span>
      </span>
      {/* Collaterals earn no interest in Compound v3 (only the base does) — show
          "—" rather than a misleading 0.00%; their key metric (max LTV) is above. */}
      <span className="aer-num" style={{ fontSize: 15, color: "var(--pos)", fontWeight: 600 }}>{m.kind === "base" ? `${m.supplyApy.toFixed(2)}%` : "—"}</span>
      <span className="aer-num" style={{ fontSize: 15, color: "var(--marble)", fontWeight: 600 }}>{m.kind === "base" ? `${m.borrowApy.toFixed(2)}%` : "—"}</span>
      <span className="aer-num" style={{ fontSize: 14, color: "var(--marble-2)" }}>{fmtCompact(m.total)}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--basalt-2)", overflow: "hidden", maxWidth: 64 }}>
          <span style={{ display: "block", height: "100%", width: `${Math.min(m.util, 100)}%`, background: "var(--gold)" }} />
        </span>
        <span className="aer-num" style={{ fontSize: 12.5, color: "var(--marble-3)" }}>{m.util.toFixed(1)}%</span>
      </span>
      <span style={{ display: "flex", gap: 6 }}>
        {m.chains.map((ch) => <ChainGlyph key={ch} chain={ch} size={18} />)}
      </span>
    </div>
  );
};


export const Markets = ({ markets }: { markets: MarketRow[] }) => (
  <Section id="markets" style={{ paddingTop: 96, paddingBottom: 96 }}>
    <SectionHead eyebrow="Markets" title="Rates across the treasury" intro="Live supply and borrow rates for every asset in the pool. Read-only — connect a gate to act." titleSize={40} />

    <div style={{
      marginTop: 32, border: "1px solid var(--stone-line-2)", borderRadius: "var(--r-lg)", overflow: "hidden",
      background: "linear-gradient(180deg, var(--basalt), var(--obsidian))",
    }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1.2fr 1fr 1fr", gap: 16,
        padding: "16px 24px", borderBottom: "1px solid var(--stone-line)",
        fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--marble-3)",
      }}>
        <span>Asset</span><span>Supply APY</span><span>Borrow APY</span><span>Total supplied</span><span>Utilization</span><span>Gates</span>
      </div>
      {markets.map((m, i) => <MarketTableRow key={m.asset} m={m} last={i === markets.length - 1} />)}
    </div>
  </Section>
);
