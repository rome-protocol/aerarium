// Failing tests for the liquidation-risk severity classifier + bar fill.
// Fails today because lib/portal/stats.ts does not export severityFromRisk
// or computeRiskBarFill yet.

import { describe, it, expect } from "vitest";
import { severityFromRisk, computeRiskBarFill, type RiskSeverity } from "../stats";

describe("severityFromRisk", () => {
  it("classifies no debt as 'safe'", () => {
    expect(severityFromRisk(0)).toBe<RiskSeverity>("safe");
  });

  it("classifies <60% as 'ok'", () => {
    expect(severityFromRisk(0.3)).toBe<RiskSeverity>("ok");
    expect(severityFromRisk(0.59)).toBe<RiskSeverity>("ok");
  });

  it("classifies 60-85% as 'warn'", () => {
    expect(severityFromRisk(0.6)).toBe<RiskSeverity>("warn");
    expect(severityFromRisk(0.84)).toBe<RiskSeverity>("warn");
  });

  it("classifies 85-100% as 'danger'", () => {
    expect(severityFromRisk(0.85)).toBe<RiskSeverity>("danger");
    expect(severityFromRisk(0.99)).toBe<RiskSeverity>("danger");
  });

  it("classifies >=100% as 'liquidatable'", () => {
    expect(severityFromRisk(1.0)).toBe<RiskSeverity>("liquidatable");
    expect(severityFromRisk(1.5)).toBe<RiskSeverity>("liquidatable");
  });

  it("treats Infinity / NaN safely (treated as no-debt safe)", () => {
    // 0 borrow → 0 / 0 = NaN in computeRiskPct, treated as safe.
    expect(severityFromRisk(Number.NaN)).toBe<RiskSeverity>("safe");
  });
});

describe("computeRiskBarFill", () => {
  it("returns 0 when no debt", () => {
    expect(computeRiskBarFill(0)).toBe(0);
  });

  it("returns the risk pct directly when below liquidation", () => {
    expect(computeRiskBarFill(0.5)).toBeCloseTo(0.5, 6);
    expect(computeRiskBarFill(0.85)).toBeCloseTo(0.85, 6);
  });

  it("clamps at 1.0 when over-liquidated (bar can't render past full)", () => {
    expect(computeRiskBarFill(1.2)).toBe(1);
    expect(computeRiskBarFill(2.0)).toBe(1);
  });
});
