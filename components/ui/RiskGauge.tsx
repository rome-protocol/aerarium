"use client";

// Liquidation risk gauge — horizontal bar with severity-coloured fill.
// Severity buckets and bar fill come from lib/portal/stats.ts so the
// classification stays unit-tested.

import { computeRiskBarFill, severityFromRisk, type RiskSeverity } from "@/lib/portal/stats";

const SEVERITY_COLORS: Record<RiskSeverity, string> = {
  safe: "#1a9d3f",        // green
  ok: "#1a9d3f",          // green (debt exists but well under threshold)
  warn: "#c87f00",        // amber
  danger: "#c8421b",      // red
  liquidatable: "#9b1c1c", // deep red
};

const SEVERITY_COPY: Record<RiskSeverity, string> = {
  safe: "Safe",
  ok: "Safe",
  warn: "At risk",
  danger: "Near liquidation",
  liquidatable: "Liquidatable",
};

interface RiskGaugeProps {
  /** liquidationRiskPct = borrow / liquidationThreshold (0..>1). */
  riskPct: number;
  borrowValueUSD: number;
  liquidationThresholdUSD: number;
  healthFactor: number;
}

export function RiskGauge({
  riskPct,
  borrowValueUSD,
  liquidationThresholdUSD,
  healthFactor,
}: RiskGaugeProps) {
  const severity = severityFromRisk(riskPct);
  const fill = computeRiskBarFill(riskPct);
  const color = SEVERITY_COLORS[severity];
  const copy = SEVERITY_COPY[severity];

  // "Liquidation at 1.0" marker — sits at 100% of the bar regardless of severity.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--fg2)",
        }}
      >
        <span>Liquidation risk</span>
        <span style={{ color, fontWeight: 600 }}>{copy}</span>
      </div>

      <div
        style={{
          position: "relative",
          height: 12,
          background: "var(--border-subtle)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${fill * 100}%`,
            background: color,
            transition: "width 0.4s ease, background-color 0.3s ease",
          }}
        />
        {/* tick at the 100% mark to communicate "this is where liquidation happens" */}
        <div
          style={{
            position: "absolute",
            right: 0,
            top: -2,
            bottom: -2,
            width: 2,
            background: "var(--fg2)",
            opacity: 0.4,
          }}
        />
      </div>

      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 12,
          color: "var(--fg2)",
          lineHeight: 1.4,
        }}
      >
        {borrowValueUSD === 0 ? (
          <>No debt · health <strong style={{ color: "var(--fg1)" }}>∞</strong></>
        ) : (
          <>
            ${borrowValueUSD.toFixed(0)} borrowed of ${liquidationThresholdUSD.toFixed(0)} liquidation threshold ·
            health <strong style={{ color }}>{healthFactor.toFixed(2)}x</strong>
          </>
        )}
      </div>
    </div>
  );
}
