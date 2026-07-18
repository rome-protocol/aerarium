"use client";
// ActivityFeed — recent tx rows. Ported from aer-app-lib.jsx.
import { eyebrow, num, fmt$ } from "./primitives";
import type { ActivityItem } from "./types";

export const ActivityFeed = ({ items }: { items: ActivityItem[] }) => (
  <div className="aer-card" style={{ padding: 24 }}>
    <h3 className="aer-display" style={{ fontSize: 18, margin: "0 0 16px", fontWeight: 400 }}>Recent activity</h3>
    {items.length === 0
      ? <p style={{ margin: 0, fontSize: 13.5, color: "var(--marble-3)" }}>No activity yet — your first action will appear here.</p>
      : items.map((it) => (
        <div key={it.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "baseline", padding: "11px 0", borderBottom: "1px solid var(--stone-line)" }}>
          <span style={{ ...eyebrow, fontSize: 10.5, width: 70 }}>{it.time}</span>
          <span style={{ fontSize: 13.5, color: "var(--marble)" }}><strong style={{ fontWeight: 600 }}>{it.verb}</strong> <span style={num}>{fmt$(it.amount)}</span> {it.sym}</span>
          <a href={it.txUrl || "#"} target={it.txUrl ? "_blank" : undefined} rel={it.txUrl ? "noopener noreferrer" : undefined} style={{ ...eyebrow, fontSize: 10.5, color: "var(--lane)", textDecoration: "none" }}>tx →</a>
        </div>
      ))}
  </div>
);
