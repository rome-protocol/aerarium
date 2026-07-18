"use client";

/**
 * Returns the user's current liquidation risk ratio (0..1 scale,
 * matching AccountStats.liquidationRiskPct). Currently a stub returning
 * null; Phase 4 will replace the body to read from useAccountStats once
 * the lift-state-up refactor lands.
 */
export function useRiskRatio(): number | null {
  return null;
}
