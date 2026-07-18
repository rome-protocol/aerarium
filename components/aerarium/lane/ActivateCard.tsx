"use client";
// ActivateCard (Solana first-time provisioning) + ErrorBanner.
// Ported from aer-lane.jsx. While activating, the step list becomes a ProgressCard.
import { ChainGlyph, Button } from "@/components/landing/primitives";
import { eyebrow, ACTIVATE_STEPS } from "./primitives";
import { ProgressCard } from "./ProgressCard";

export const ActivateCard = ({ activating, step, onActivate }: { activating: boolean; step: number; onActivate: () => void }) => (
  <div className="aer-card" style={{ padding: 40, maxWidth: 580, margin: "40px auto 0" }}>
    <div style={{ textAlign: "center", marginBottom: 26 }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><ChainGlyph chain="sol" size={40} /></div>
      <span style={eyebrow}>One-time setup</span>
      <h2 className="aer-display" style={{ fontSize: 30, margin: "10px 0 0", fontWeight: 400 }}>Activate your Aerarium account</h2>
      <p style={{ margin: "14px auto 0", fontSize: 15.5, color: "var(--marble-2)", maxWidth: 440, lineHeight: 1.6 }}>
        Solana needs a few accounts created on-chain before your first action. We&rsquo;ll provision them in one short setup —
        <strong style={{ color: "var(--marble)", fontWeight: 600 }}> you only do this once.</strong>
      </p>
    </div>

    {activating ? (
      <ProgressCard
        title="Setting up your account"
        note="Approve each signature in your wallet. This takes a few seconds and won't cost gas on Rome."
        steps={ACTIVATE_STEPS}
        current={step}
      />
    ) : (
      <>
        <div style={{ border: "1px solid var(--stone-line)", borderRadius: "var(--r-md)", overflow: "hidden", marginBottom: 22 }}>
          {ACTIVATE_STEPS.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: i < ACTIVATE_STEPS.length - 1 ? "1px solid var(--stone-line)" : "none" }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid var(--lane)", color: "var(--lane)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 11, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontSize: 14.5, color: "var(--marble)" }}>{s.label}</span>
            </div>
          ))}
        </div>
        <Button variant="gold" size="lg" full onClick={onActivate}>Activate — {ACTIVATE_STEPS.length} signatures</Button>
        <p style={{ margin: "14px 0 0", textAlign: "center", fontSize: 12.5, color: "var(--marble-3)" }}>
          No Ethereum key needed · No gas on Rome · One-time only
        </p>
      </>
    )}
  </div>
);

export const ErrorBanner = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderRadius: "var(--r-md)", background: "var(--oxblood-wash)", border: "1px solid var(--oxblood-br)", marginBottom: 20 }}>
    <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--oxblood-br)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>!</span>
    <span style={{ flex: 1, fontSize: 14, color: "var(--marble)" }}>{message}</span>
    <button onClick={onRetry} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--oxblood-br)", fontSize: 13.5, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>Try again</button>
  </div>
);
