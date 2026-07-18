"use client";
// ProgressCard — in-flight signing steps (check / spinner / todo per step).
// Ported from aer-app-lib.jsx. Used for both actions and Solana Activate.
import { Spin, Check, eyebrow } from "./primitives";
import type { SignStep } from "./types";

export const ProgressCard = ({ title, note, steps, current, onCancel }: {
  title: string; note?: string; steps: SignStep[]; current: number; onCancel?: () => void;
}) => (
  <div className="aer-card" style={{ padding: 24 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <Spin size={15} color="var(--lane)" />
      <h3 className="aer-display" style={{ fontSize: 19, margin: 0, fontWeight: 400 }}>{title}</h3>
    </div>
    {note && <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "var(--marble-2)", lineHeight: 1.55 }}>{note}</p>}
    <div style={{ display: "flex", flexDirection: "column" }}>
      {steps.map((s, i) => {
        const st = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: i < steps.length - 1 ? "1px solid var(--stone-line)" : "none" }}>
            {st === "done" ? <Check size={12} /> : st === "active"
              ? <span style={{ width: 21, height: 21, borderRadius: "50%", border: "1.5px solid var(--lane)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--lane)" }}><Spin size={11} color="var(--lane)" /></span>
              : <span style={{ width: 21, height: 21, borderRadius: "50%", border: "1.5px solid var(--stone-line-2)", flexShrink: 0 }} />}
            <span style={{ flex: 1, fontSize: 14, color: st === "todo" ? "var(--marble-3)" : "var(--marble)", fontWeight: st === "active" ? 600 : 400 }}>{s.label}</span>
            <span style={{ ...eyebrow, fontSize: 10 }}>{s.tag || (st === "done" ? "Done" : st === "active" ? "Sign" : "Wait")}</span>
          </div>
        );
      })}
    </div>
    {onCancel && <button onClick={onCancel} style={{ marginTop: 16, background: "none", border: "none", cursor: "pointer", ...eyebrow, textTransform: "none", color: "var(--marble-3)", textDecoration: "underline", textUnderlineOffset: 3 }}>Cancel</button>}
  </div>
);
