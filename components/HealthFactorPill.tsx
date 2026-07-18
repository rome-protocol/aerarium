"use client";

/**
 * Health factor pill — banner-mounted indicator of liquidation distance.
 *
 *   HF = 1 / (1 - riskRatio)
 *
 * where riskRatio is the codebase's `AccountStats.liquidationRiskPct`
 * (0..>1; `borrowValueUSD / liquidationThresholdUSD`). 0 = full
 * collateral / no borrow, 1 = at the liquidation threshold. Matches
 * Aave V3's HF semantics: > 1 = safe, ≤ 1 = liquidatable.
 */
export function computeHealthFactor(riskRatio: number | null): number | null {
  if (riskRatio === null || Number.isNaN(riskRatio)) return null;
  if (riskRatio <= 0) return Number.POSITIVE_INFINITY;
  if (riskRatio >= 1) return 1.0;
  return 1 / (1 - riskRatio);
}

function formatHF(hf: number | null): string {
  if (hf === null) return "—";
  if (!Number.isFinite(hf)) return "∞";
  return hf.toFixed(2);
}

export interface HealthFactorPillProps {
  /** 0..1 ratio of borrow value to liquidation threshold (matches AccountStats.liquidationRiskPct). Null = no debt. */
  riskRatio: number | null;
}

export function HealthFactorPill({ riskRatio }: HealthFactorPillProps) {
  const hf = computeHealthFactor(riskRatio);
  const display = formatHF(hf);
  // safe = HF > 1.5 (matches Aave's "yellow at 1.5, red at 1.0" convention)
  const safe = hf === null || !Number.isFinite(hf) || hf > 1.5;
  return (
    <div
      aria-label={`Health factor: ${display}`}
      style={{
        display: "inline-flex",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 999,
        background: safe ? "var(--success-bg, #e0f9e9)" : "var(--warn-bg, #fff5e6)",
        color: safe ? "var(--success-fg, #137333)" : "var(--warn-fg, #8a6100)",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        letterSpacing: "0.08em",
      }}
    >
      <span aria-hidden="true" style={{ opacity: 0.7 }}>HF</span>
      <span aria-hidden="true">{display}</span>
    </div>
  );
}
