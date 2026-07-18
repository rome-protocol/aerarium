"use client";

import type { ReactNode } from "react";

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: string;
  loading?: boolean;
}

export function Stat({ label, value, hint, loading }: StatProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--fg2)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 36,
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          color: "var(--fg1)",
          fontWeight: 400,
          minHeight: 38,
        }}
      >
        {loading ? <span style={{ color: "var(--fg3)" }}>—</span> : value}
      </div>
      {hint && (
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            color: "var(--fg2)",
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
