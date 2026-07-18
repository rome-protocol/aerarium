"use client";
// LaneHeader (sticky) + LaneIndicator chip + AccountChip.
// Ported from aer-app-lib.jsx. "← Dashboard" / wordmark route to the landing.
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark, ChainGlyph } from "@/components/landing/primitives";
import { CHAIN } from "@/components/landing/tokens";
import { eyebrow, num, short } from "./primitives";
import type { LaneSide, LaneConnection } from "./types";

export const LaneIndicator = ({ chain }: { chain: LaneSide }) => {
  const c = CHAIN[chain];
  // The gate chip links back to the lane home (/evm or /solana) so a user on a
  // sub-page (/evm/liquidate, /solana/faucet) can return to their lane. On the
  // lane home itself that link is a no-op (self-link), which reads as "dead" —
  // so there we render a plain, non-interactive chip instead of a fake link.
  const home = chain === "sol" ? "/solana" : "/evm";
  const onHome = usePathname() === home;
  const chipStyle = {
    display: "inline-flex" as const, alignItems: "center" as const, gap: 8,
    padding: "6px 13px", borderRadius: "var(--r-pill)",
    background: "var(--lane-wash)", border: "1px solid var(--lane)",
    fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em",
    textTransform: "uppercase" as const, color: "var(--lane)", fontWeight: 500,
  };
  if (onHome) {
    return (
      <span style={chipStyle}>
        <ChainGlyph chain={chain} size={14} /> {c.label} Gate
      </span>
    );
  }
  return (
    <Link href={home} style={{ ...chipStyle, cursor: "pointer", textDecoration: "none" }}>
      <ChainGlyph chain={chain} size={14} /> {c.label} Gate
    </Link>
  );
};

export const AccountChip = ({ address, wallet, onDisconnect }: { address: string; wallet?: string; onDisconnect: () => void }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
      <span
        onClick={() => { navigator.clipboard?.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1100); }}
        title="Copy address"
        style={{
          display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
          padding: "6px 13px 6px 11px", borderRadius: "var(--r-pill)",
          border: "1px solid var(--stone-line-2)", background: "var(--basalt)",
        }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--pos)" }} />
        {wallet && <span style={{ ...eyebrow, color: "var(--marble-3)" }}>{wallet}</span>}
        <span style={{ ...num, fontSize: 13, color: "var(--marble)" }}>{copied ? "copied" : short(address)}</span>
      </span>
      <button onClick={onDisconnect} style={{ background: "none", border: "none", cursor: "pointer", ...eyebrow, textTransform: "none", fontSize: 12.5, color: "var(--marble-3)", textDecoration: "underline", textUnderlineOffset: 3 }}>Disconnect</button>
    </div>
  );
};

export const LaneHeader = ({ chain, account, onDisconnect, extraLinks }: {
  chain: LaneSide;
  account: (LaneConnection & { address: string }) | null;
  onDisconnect: () => void;
  /** Optional secondary nav (EVM lane: Liquidate / Faucet). Rendered as mono-eyebrow
   *  text links just before "Dashboard". Absent/empty => nothing extra. */
  extraLinks?: { label: string; href: string }[];
}) => {
  // "Dashboard" now points at the lane's RICH positions page (/evm/dashboard or
  // /solana/dashboard), NOT the marketing landing — the wordmark + the gate
  // chip already cover "go home". On the dashboard route itself it'd be a dead
  // self-link, so render it as plain muted text there (same pattern as the gate
  // chip on the lane home).
  const dashboardHref = chain === "sol" ? "/solana/dashboard" : "/evm/dashboard";
  // "Manage" is the explicit, labeled way back to the action surface (the lane
  // home). The gate chip navigates there too but reads as a lane indicator, not
  // a destination — so from a sub-page (dashboard / liquidate / faucet) this is
  // the obvious "go act" link. Plain text on the lane home itself (self-link).
  const laneHome = chain === "sol" ? "/solana" : "/evm";
  // The OTHER gate — for the in-lane switcher (mis-picks / curiosity). Switching
  // lands on the other lane's home, which gates to its own connect.
  const otherLane = chain === "sol" ? "/evm" : "/solana";
  const otherLabel = chain === "sol" ? "Ethereum" : "Solana";
  const path = usePathname();
  const onDashboard = path === dashboardHref;
  const onLaneHome = path === laneHome;
  const navLinkStyle = { ...eyebrow, color: "var(--marble-2)", textDecoration: "none", display: "inline-flex", alignItems: "center" } as const;
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(251,248,244,0.86)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: "1px solid var(--stone-line)" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Link href="/" style={{ textDecoration: "none" }}><Wordmark size={18} sub={false} /></Link>
          <span style={{ width: 1, height: 26, background: "var(--stone-line-2)" }} />
          <LaneIndicator chain={chain} />
          {/* Gate switcher — jump to the other lane (lands on its connect). */}
          <Link href={otherLane} style={{ ...navLinkStyle, color: "var(--marble-3)", fontSize: 11 }} title={`Switch to the ${otherLabel} gate`}>
            <span aria-hidden="true" style={{ marginRight: 5 }}>⇄</span>Switch to {otherLabel}
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {onLaneHome ? (
            <span style={{ ...navLinkStyle, color: "var(--marble-3)" }}>Manage</span>
          ) : (
            <Link href={laneHome} style={navLinkStyle}>Manage</Link>
          )}
          {extraLinks?.map((l) => (
            <Link key={l.href} href={l.href} style={navLinkStyle}>{l.label}</Link>
          ))}
          {onDashboard ? (
            <span style={{ ...navLinkStyle, color: "var(--marble-3)" }}>Dashboard</span>
          ) : (
            <Link href={dashboardHref} style={navLinkStyle}>Dashboard</Link>
          )}
          {account && <AccountChip address={account.address} wallet={account.wallet} onDisconnect={onDisconnect} />}
        </div>
      </div>
    </div>
  );
};
