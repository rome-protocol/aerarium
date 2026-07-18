"use client";
// ConnectCard — disconnected entry. Wallet list (first item lane-highlighted),
// connecting spinner. Ported from aer-app-lib.jsx.
import Link from "next/link";
import { ChainGlyph } from "@/components/landing/primitives";
import { CHAIN } from "@/components/landing/tokens";
import { Spin, eyebrow } from "./primitives";
import type { LaneSide } from "./types";

export const ConnectCard = ({ chain, wallets, connecting, onConnect }: {
  chain: LaneSide; wallets: string[]; connecting: string | null; onConnect: (wallet: string) => void;
}) => {
  const c = CHAIN[chain];
  return (
    <div className="aer-card" style={{ padding: 48, textAlign: "center", maxWidth: 560, margin: "40px auto 0" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}><ChainGlyph chain={chain} size={44} /></div>
      <h2 className="aer-display" style={{ fontSize: 32, margin: 0, fontWeight: 400 }}>Enter the {c.label} Gate</h2>
      <p style={{ margin: "14px auto 28px", fontSize: 16, color: "var(--marble-2)", maxWidth: 400, lineHeight: 1.6 }}>
        Connect your {c.label} wallet to supply, borrow, and manage your position in the shared pool.
      </p>
      {connecting ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--lane)", fontSize: 15 }}>
          <Spin size={16} color="var(--lane)" /> Connecting to {connecting}…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320, margin: "0 auto" }}>
          {wallets.map((w, i) => (
            <button key={w} onClick={() => onConnect(w)} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px",
              border: "1px solid " + (i === 0 ? "var(--lane)" : "var(--stone-line-2)"), borderRadius: "var(--r-md)",
              background: i === 0 ? "var(--lane-wash)" : "var(--basalt)", cursor: "pointer",
              fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--marble)",
            }}>
              {w} <span style={{ color: "var(--lane)" }}>→</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ marginTop: 26 }}><Link href="/" style={{ ...eyebrow, textTransform: "none", color: "var(--marble-3)", textDecoration: "none" }}>← Back to home</Link></div>
    </div>
  );
};
