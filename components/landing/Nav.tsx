"use client";
// =====================================================================
// AERARIUM landing — NAV (wordmark · links · Rome testnet pill · app entry)
// The primary CTA adapts: a first-time visitor gets "Open app →" (scrolls to
// the #gates picker — the pick-your-side moment). A RETURNING visitor (a lane
// remembered via lib/lastLane) gets a direct "Resume {lane} →" that skips the
// picker. The old label was "Connect", which misleadingly implied a wallet
// modal when it only scrolled. lastLane is read in an effect (client-only) so
// the server render is the neutral "Open app" — no hydration mismatch.
// =====================================================================
import { useState, useEffect } from "react";
import { Wordmark, NetPill, Button } from "./primitives";
import { getLastLane } from "@/lib/lastLane";
import type { LaneSide } from "@/components/aerarium/lane/types";

const links = [
  { label: "The Pool", href: "#pool" },
  { label: "The Arena", href: "#arena" },
  { label: "Liquidations", href: "#liquidations" },
  { label: "Markets", href: "#markets" },
];

export const Nav = () => {
  const [scrolled, setScrolled] = useState(false);
  // Returning-user fast path — resolved client-side after mount.
  const [lastLane, setLast] = useState<LaneSide | null>(null);
  useEffect(() => setLast(getLastLane()), []);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 50,
      background: scrolled ? "rgba(16,12,14,0.82)" : "transparent",
      backdropFilter: scrolled ? "blur(16px) saturate(140%)" : "none",
      WebkitBackdropFilter: scrolled ? "blur(16px) saturate(140%)" : "none",
      borderBottom: scrolled ? "1px solid var(--stone-line)" : "1px solid transparent",
      transition: "all var(--dur) var(--ease)",
    }}>
      <div style={{
        maxWidth: "var(--maxw)", margin: "0 auto", padding: "16px var(--gutter)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24,
      }}>
        <a href="#top" style={{ textDecoration: "none" }}><Wordmark size={20} sub={false} /></a>
        <nav style={{ display: "flex", gap: 30 }} className="aer-hide-sm">
          {links.map((l) => (
            <a key={l.href} href={l.href} style={{
              fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: 500,
              color: "var(--marble-2)", letterSpacing: "0.02em",
              textTransform: "uppercase", transition: "color var(--dur)",
            }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--marble)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--marble-2)")}
            >{l.label}</a>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="aer-hide-sm"><NetPill>Rome · Testnet</NetPill></span>
          {lastLane ? (
            <Button variant="gold" size="md" href={lastLane === "sol" ? "/solana" : "/evm"}>
              Resume {lastLane === "sol" ? "Solana" : "Ethereum"} Gate →
            </Button>
          ) : (
            <Button variant="gold" size="md" href="#gates">Open app →</Button>
          )}
        </div>
      </div>
    </div>
  );
};
