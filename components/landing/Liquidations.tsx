"use client";
// =====================================================================
// AERARIUM landing — OPEN FOR LIQUIDATION (claimable underwater positions)
// Ported from design/aer-sections2.jsx. Reads OpenLiquidation[] from
// MarketSource. Per-row "Claim" routes to the gate matching the
// position's side; the footer CTA routes to the gate picker.
// =====================================================================
import { useState } from "react";
import type { OpenLiquidation } from "@/lib/market/MarketSource";
import { Section, SectionHead, Button, ChainBadge, PreviewBadge } from "./primitives";
import { CHAIN, GATE_HREF, fmtCompact } from "./tokens";

const LiqRow = ({ p }: { p: OpenLiquidation }) => {
  const [h, setH] = useState(false);
  const c = CHAIN[p.side];
  return (
    <div
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: "grid", gridTemplateColumns: "120px 1.4fr 1fr 0.9fr 1fr auto", gap: 16, alignItems: "center",
        padding: "18px 20px", borderBottom: "1px solid var(--stone-line)",
        background: h ? c.wash : "transparent", transition: "background var(--dur)",
        borderLeft: `2px solid ${h ? c.color : "transparent"}`,
      }}>
      <span><ChainBadge chain={p.side} size="sm" /></span>
      <span className="aer-mono" style={{ fontSize: 13.5, color: "var(--marble)" }}>{p.borrower}</span>
      <span>
        <span style={{ fontSize: 14, color: "var(--marble)", fontWeight: 500 }}>{p.collateral}</span>
        <span className="aer-num" style={{ fontSize: 12, color: "var(--marble-3)", marginLeft: 8 }}>{fmtCompact(p.collateralUsd)}</span>
      </span>
      <span className="aer-num" style={{ fontSize: 14, color: "var(--oxblood-br)", fontWeight: 600 }}>{p.health.toFixed(2)}</span>
      <span className="aer-num" style={{ fontSize: 16, color: "var(--gold)", fontWeight: 600 }}>{fmtCompact(p.reward)}</span>
      <span style={{ textAlign: "right" }}>
        <Button variant="chain" chain={p.side} size="sm" href={GATE_HREF[p.side]}>Claim</Button>
      </span>
    </div>
  );
};

export const Liquidations = ({ liquidations }: { liquidations: OpenLiquidation[] }) => {
  const illustrative = liquidations.some((p) => p.illustrative);
  return (
    <Section id="liquidations" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 20, marginBottom: 32 }}>
        <SectionHead
          eyebrow="Open for liquidation"
          title="Underwater. Unclaimed. Yours to take."
          intro="These positions have crossed the line. Any liquidator can repay the debt and seize the collateral at a bonus — from either chain."
          titleSize={40}
          preview={illustrative}
        />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--marble-3)", textAlign: "right", whiteSpace: "nowrap" }}>
          <div style={{ color: "var(--gold)", fontSize: 26, fontWeight: 600 }} className="aer-num">{liquidations.length}</div>
          positions open now
        </div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "120px 1.4fr 1fr 0.9fr 1fr auto", gap: 16,
        padding: "0 20px 12px", borderBottom: "1px solid var(--stone-line)",
        fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.16em",
        textTransform: "uppercase", color: "var(--marble-3)",
      }}>
        <span>Side</span><span>Borrower</span><span>Collateral</span><span>Health</span><span style={{ color: "var(--gold)" }}>Your reward</span><span></span>
      </div>

      <div>
        {liquidations.map((p) => <LiqRow key={p.id} p={p} />)}
      </div>

      <div style={{
        marginTop: 24, padding: "18px 22px", borderRadius: "var(--r-md)",
        border: "1px dashed var(--stone-line-2)", background: "var(--gold-wash)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 15, color: "var(--marble-2)" }}>
          <strong style={{ color: "var(--marble)", fontWeight: 600 }}>Connect to claim.</strong> Your gate decides your side — Ethereum or Solana.
        </span>
        <Button variant="gold" size="md" href="#gates">Connect to claim →</Button>
      </div>
    </Section>
  );
};
