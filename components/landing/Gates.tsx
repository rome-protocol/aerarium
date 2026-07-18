"use client";
// =====================================================================
// AERARIUM landing — CHOOSE YOUR GATE (the conversion CTA / gate picker)
// Ported from design/aer-sections2.jsx. Each gate card's CTA routes via
// Next <Link> to its lane screen (/evm, /solana) — routes 404 until
// those screens are built (expected).
// =====================================================================
import { useState } from "react";
import { Section, Button, ChainBadge } from "./primitives";
import { CHAIN, GATE_HREF, type Side } from "./tokens";

// A Roman arch / gate drawn in SVG, tinted to the chain.
const GateArch = ({ chain }: { chain: Side }) => {
  const c = CHAIN[chain];
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" style={{ position: "absolute", right: -20, top: -20, width: 200, height: 200, opacity: 0.14 }}>
      <path d="M40 180 V90 A60 60 0 0 1 160 90 V180" fill="none" stroke={c.bright} strokeWidth="3" />
      <path d="M64 180 V96 A36 36 0 0 1 136 96 V180" fill="none" stroke={c.bright} strokeWidth="2" />
      <rect x="30" y="180" width="140" height="8" fill={c.bright} />
      <rect x="34" y="60" width="132" height="6" fill={c.bright} opacity="0.6" />
    </svg>
  );
};

const GateCard = ({ chain, title, wallets }: { chain: Side; title: string; wallets: string[] }) => {
  const [h, setH] = useState(false);
  const c = CHAIN[chain];
  return (
    <div
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        position: "relative", overflow: "hidden",
        border: `1px solid ${h ? c.color : "var(--stone-line-2)"}`,
        borderRadius: "var(--r-lg)", padding: "40px 36px",
        background: h ? `linear-gradient(180deg, ${c.wash}, var(--obsidian))` : "linear-gradient(180deg, var(--basalt), var(--obsidian))",
        transition: "all var(--dur) var(--ease)",
        transform: h ? "translateY(-3px)" : "none",
        boxShadow: h ? `0 24px 60px -24px ${c.color}` : "none",
      }}>
      <GateArch chain={chain} />

      <div style={{ position: "relative" }}>
        <ChainBadge chain={chain} />
        <h3 className="aer-display" style={{ fontSize: 30, fontWeight: 400, margin: "20px 0 10px", color: "var(--marble)" }}>{title}</h3>
        <p style={{ margin: "0 0 28px", fontSize: 14.5, color: "var(--marble-2)", lineHeight: 1.6 }}>
          {chain === "evm"
            ? "Supply and borrow with the assets you already hold on Ethereum. Fight for Ethereum in the arena."
            : "Bring your Solana liquidity into the same market. Carry the violet into every liquidation."}
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
          {wallets.map((w) => (
            <span key={w} style={{
              fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--marble-2)",
              border: "1px solid var(--stone-line-2)", borderRadius: "var(--r-sm)", padding: "5px 11px",
            }}>{w}</span>
          ))}
        </div>

        <Button variant="chain" chain={chain} size="lg" full href={GATE_HREF[chain]}>
          Enter the {chain === "evm" ? "Ethereum" : "Solana"} Gate →
        </Button>
      </div>
    </div>
  );
};

export const Gates = () => (
  <Section id="gates" style={{ paddingTop: 96, paddingBottom: 96 }}>
    <div style={{ textAlign: "center", marginBottom: 44 }}>
      <div className="aer-eyebrow" style={{ marginBottom: 16 }}>Choose your gate</div>
      <h2 className="aer-display" style={{ fontSize: "clamp(36px, 5vw, 56px)", margin: 0, fontWeight: 400 }}>
        Two gates. One treasury.
      </h2>
      <p style={{ maxWidth: 600, margin: "18px auto 0", fontSize: 17, color: "var(--marble-2)", lineHeight: 1.6 }}>
        Enter from the chain you already hold. Your wallet is your side — and your standing in the arena.
      </p>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
      <GateCard chain="evm" title="The Ethereum Gate" wallets={["MetaMask", "Rabby", "WalletConnect"]} />
      <GateCard chain="sol" title="The Solana Gate" wallets={["Phantom", "Solflare", "Backpack"]} />
    </div>
  </Section>
);
