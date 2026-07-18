"use client";
// =====================================================================
// AERARIUM landing — FOOTER
// Ported from design/aer-sections2.jsx. Protocol links scroll to the
// in-page sections; external/network links are inert placeholders.
// =====================================================================
import { Section, Wordmark, RomeLockup, NetPill } from "./primitives";

const FootCol = ({ title, links }: { title: string; links: { label: string; href: string }[] }) => (
  <div>
    <div className="aer-eyebrow" style={{ color: "var(--marble-3)", marginBottom: 14 }}>{title}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {links.map((l) => (
        <a key={l.label} href={l.href} style={{ fontSize: 13.5, color: "var(--marble-2)", textDecoration: "none" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--marble-2)")}
        >{l.label}</a>
      ))}
    </div>
  </div>
);

// Only the Protocol column survives — its links are real in-page anchors. The
// old "Build" (Docs/GitHub/Audits/Bug bounty) and "Network" (Rome/Bridge
// status/Explorer) columns were all href="#" placeholders; with no real targets
// to wire, dead-end links are worse than no links, so they're removed.
const protocolLinks = [
  { label: "The Pool", href: "#pool" },
  { label: "The Arena", href: "#arena" },
  { label: "Markets", href: "#markets" },
  { label: "Liquidations", href: "#liquidations" },
];

export const Footer = () => (
  <footer style={{ position: "relative", zIndex: 1, borderTop: "1px solid var(--stone-line)", marginTop: 40 }}>
    <Section style={{ paddingTop: 56, paddingBottom: 56 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 40, flexWrap: "wrap", marginBottom: 40 }}>
        <div style={{ maxWidth: 320 }}>
          <Wordmark size={22} />
          <p style={{ marginTop: 18, fontSize: 13.5, color: "var(--marble-3)", lineHeight: 1.6 }}>
            One pool. Two rival chains. A cross-VM money market on the Rome network.
          </p>
        </div>
        <div style={{ display: "flex", gap: 56, flexWrap: "wrap" }}>
          <FootCol title="Protocol" links={protocolLinks} />
        </div>
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20,
        paddingTop: 26, borderTop: "1px solid var(--stone-line)", flexWrap: "wrap",
      }}>
        <RomeLockup size={20} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--marble-3)" }}>
          Aerarium · Testnet · {new Date().getFullYear()}
        </span>
        <NetPill>Rome · Testnet</NetPill>
      </div>
    </Section>
  </footer>
);
