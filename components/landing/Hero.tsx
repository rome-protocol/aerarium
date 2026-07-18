"use client";
// =====================================================================
// AERARIUM landing — HERO ("One pool. Two rival chains.")
// Ported from design/aer-sections.jsx. The live ticker strip reads the
// pool figures from MarketSource (passed as props). "Choose your gate"
// scrolls to the gate picker (#gates).
// =====================================================================
import type { ReactNode } from "react";
import type { PoolSplit } from "@/lib/market/MarketSource";
import { Section, Button, Counter, ChainGlyph, RomeLockup, PreviewBadge } from "./primitives";
import { scaleUsd, type Side } from "./tokens";

// Decorative fluted column flanking the hero.
const Column = ({ side, tint }: { side: "left" | "right"; tint: string }) => (
  <div aria-hidden="true" style={{
    position: "absolute", top: 0, bottom: 0, width: 120,
    [side]: 0, pointerEvents: "none", opacity: 0.5,
    background: `linear-gradient(90deg, ${side === "left" ? "transparent, " + tint : tint + ", transparent"})`,
    maskImage: "repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 14px)",
    WebkitMaskImage: "repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 14px)",
  }} />
);

const TickerCell = ({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) => (
  <div style={{ padding: "16px 26px", textAlign: "left" }}>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--marble-3)", marginBottom: 6 }}>{label}</div>
    <div className="aer-num" style={{ fontSize: 22, fontWeight: 600, color: accent ? "var(--gold)" : "var(--marble)" }}>{value}</div>
  </div>
);
const TickerDiv = () => <div style={{ width: 1, alignSelf: "stretch", background: "var(--stone-line)" }} />;

export const Hero = ({ pool }: { pool: PoolSplit }) => (
  <header id="top" style={{ position: "relative", overflow: "hidden", paddingTop: 56, paddingBottom: 8 }}>
    <Column side="left" tint="var(--evm-wash)" />
    <Column side="right" tint="var(--sol-wash)" />

    <Section style={{ textAlign: "center", position: "relative", paddingTop: 40, paddingBottom: 48 }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 12,
          fontFamily: "var(--font-mono)", fontSize: 11.5, letterSpacing: "0.24em",
          textTransform: "uppercase", color: "var(--marble-3)",
          border: "1px solid var(--stone-line-2)", borderRadius: "var(--r-pill)", padding: "7px 18px",
        }}>
          <ChainGlyph chain={"evm" as Side} size={14} /> A money market on Rome <ChainGlyph chain={"sol" as Side} size={14} />
        </span>
      </div>

      <h1 className="aer-display" style={{
        fontSize: "clamp(44px, 7vw, 88px)", margin: 0, fontWeight: 400, lineHeight: 1.02,
        letterSpacing: "-0.02em",
      }}>
        One pool.<br />
        Two <span style={{
          background: "linear-gradient(90deg, var(--evm-bright) 0%, var(--gold-bright) 50%, var(--sol-bright) 100%)",
          WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
        }}>rival chains.</span>
      </h1>

      <p style={{ maxWidth: 660, margin: "26px auto 0", fontSize: 19, lineHeight: 1.6, color: "var(--marble-2)" }}>
        Ethereum and Solana supply and borrow the <em style={{ color: "var(--marble)", fontStyle: "normal", fontWeight: 500 }}>same liquidity</em> —
        one shared market, no bridge. Allies in yield. Rivals in the arena.
      </p>

      <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 34, flexWrap: "wrap" }}>
        <Button variant="gold" size="lg" href="#gates">Choose your gate →</Button>
        <Button variant="outline" size="lg" href="#arena">Enter the arena</Button>
      </div>

      {/* Live one-pool ticker strip */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 0, marginTop: 48,
        border: "1px solid var(--stone-line-2)", borderRadius: "var(--r-lg)",
        background: "rgba(22,17,15,0.6)", backdropFilter: "blur(8px)",
        overflow: "hidden", flexWrap: "wrap",
      }}>
        <TickerCell label="Total liquidity" value={(() => { const s = scaleUsd(pool.totalSupplied); return <Counter value={s.value} prefix="$" suffix={s.suffix} decimals={s.decimals} />; })()} />
        <TickerDiv />
        <TickerCell label="Suppliers" value={<Counter value={pool.suppliers} />} />
        <TickerDiv />
        <TickerCell label="Net APR" value={<Counter value={pool.netApr} suffix="%" decimals={2} />} accent />
        <TickerDiv />
        <TickerCell label="Live on" value={<span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><ChainGlyph chain={"evm" as Side} size={15} /><ChainGlyph chain={"sol" as Side} size={15} /></span>} />
      </div>

      {pool.illustrative && (
        <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
          <PreviewBadge />
        </div>
      )}

      <div style={{ marginTop: 30, display: "flex", justifyContent: "center" }}>
        <RomeLockup size={18} />
      </div>
    </Section>
  </header>
);
