// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HealthFactorPill, computeHealthFactor } from "../HealthFactorPill";

describe("computeHealthFactor", () => {
  it("returns null when riskRatio is null (no debt)", () => {
    expect(computeHealthFactor(null)).toBeNull();
  });
  it("returns null when riskRatio is NaN (defends against stale numeric state)", () => {
    expect(computeHealthFactor(NaN)).toBeNull();
  });
  it("returns Infinity when riskRatio is 0 (full collateral, no borrow)", () => {
    expect(computeHealthFactor(0)).toBe(Number.POSITIVE_INFINITY);
  });
  it("returns ~2.0 when riskRatio is 0.5", () => {
    const hf = computeHealthFactor(0.5);
    expect(hf).toBeCloseTo(2.0, 2);
  });
  it("returns ~1.0 when riskRatio is 1.0 (liquidatable threshold)", () => {
    expect(computeHealthFactor(1.0)).toBeCloseTo(1.0, 2);
  });
});

describe("HealthFactorPill", () => {
  it("renders 'HF' label and '—' when riskRatio is null", () => {
    render(<HealthFactorPill riskRatio={null} />);
    expect(screen.getByText("HF")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByLabelText(/Health factor: —/)).toBeInTheDocument();
  });
  it("renders '∞' when riskRatio is 0 (no borrow)", () => {
    render(<HealthFactorPill riskRatio={0} />);
    expect(screen.getByText("∞")).toBeInTheDocument();
    expect(screen.getByLabelText(/Health factor: ∞/)).toBeInTheDocument();
  });
  it("renders value to 2 decimals", () => {
    // riskRatio=0.7 → HF = 1 / (1 - 0.70) = 1 / 0.30 ≈ 3.33
    render(<HealthFactorPill riskRatio={0.7} />);
    expect(screen.getByText("3.33")).toBeInTheDocument();
    expect(screen.getByLabelText(/Health factor: 3\.33/)).toBeInTheDocument();
  });
});
