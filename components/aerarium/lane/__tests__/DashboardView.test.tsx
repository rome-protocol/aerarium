// @vitest-environment jsdom
//
// DashboardView is the shared, lane-agnostic body of /evm/dashboard +
// /solana/dashboard: the reused PositionSummary (aggregate) above the new
// DashboardPositions (per-asset breakdown). It owns only the empty/loading
// branch; the per-asset + aggregate rendering is the composed components'.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardView } from "../DashboardView";
import type { LanePosition } from "../types";

const position: LanePosition = {
  supplied: 1200, borrowed: 300, capacity: 800, healthFactor: 2.5, netApr: 1.5,
  assets: [
    { sym: "wUSDC", name: "USD Coin", supplyApy: 5, borrowApy: 7, borrowable: true, walletBal: 900, suppliedBal: 1200, borrowedBal: 300, walletTokens: 900, suppliedTokens: 1200, borrowedTokens: 300, priceUsd: 1, borrowCollateralFactor: 0 },
  ],
};
const href = (a: string, s: string) => `/evm?asset=${s}&action=${a}`;

describe("DashboardView", () => {
  it("renders the aggregate position summary + the per-asset breakdown when a position exists", () => {
    render(<DashboardView position={position} hasPosition positionLoading={false} actionHref={href} />);
    expect(screen.getByText(/Your position/i)).toBeInTheDocument(); // PositionSummary
    expect(screen.getByRole("columnheader", { name: /supplied/i })).toBeInTheDocument(); // DashboardPositions
  });

  it("shows a loading state before the first read lands (not a flash of empty)", () => {
    render(<DashboardView position={{ ...position, supplied: 0, borrowed: 0 }} hasPosition={false} positionLoading actionHref={href} />);
    expect(screen.getByText(/Loading your positions/i)).toBeInTheDocument();
  });
});
