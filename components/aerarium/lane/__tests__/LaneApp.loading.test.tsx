// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LaneApp } from "../LaneApp";
import type { LaneAdapter, LanePosition } from "../types";

const emptyPosition: LanePosition = {
  supplied: 0, borrowed: 0, capacity: 0, healthFactor: 0, netApr: 0,
  assets: [{ sym: "wUSDC", name: "USD Coin", supplyApy: 5, borrowApy: 7, borrowable: true, walletBal: 0, suppliedBal: 0, borrowedBal: 0, walletTokens: 0, suppliedTokens: 0, borrowedTokens: 0, priceUsd: 1, borrowCollateralFactor: 0 }],
};

function adapter(over: Partial<LaneAdapter>): LaneAdapter {
  return {
    chain: "evm", wallets: ["MetaMask"],
    connection: { status: "connected", address: "0xabc", wallet: "MetaMask" },
    connect: () => {}, disconnect: () => {},
    provisioned: true, activating: false, activateStep: 0, activate: () => {},
    position: emptyPosition, hasPosition: false, positionLoading: false,
    activity: [], lastResult: null,
    submitAction: () => {}, signing: false, signStep: 0, signPlan: [],
    error: null, clearError: () => {},
    ...over,
  };
}

describe("LaneApp position loading state", () => {
  it("shows 'Loading your positions…' while the first read is in flight (not 'No position yet')", () => {
    render(<LaneApp adapter={adapter({ positionLoading: true, hasPosition: false })} />);
    expect(screen.getByText(/Loading your positions/i)).toBeInTheDocument();
    expect(screen.queryByText(/No position yet/i)).toBeNull();
  });

  it("shows 'No position yet' only once loaded + genuinely empty", () => {
    render(<LaneApp adapter={adapter({ positionLoading: false, hasPosition: false })} />);
    expect(screen.getByText(/No position yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Loading your positions/i)).toBeNull();
  });

  it("does not show the loading banner once a position exists (even if still polling)", () => {
    render(<LaneApp adapter={adapter({ positionLoading: true, hasPosition: true, position: { ...emptyPosition, supplied: 100 } })} />);
    expect(screen.queryByText(/Loading your positions/i)).toBeNull();
    expect(screen.queryByText(/No position yet/i)).toBeNull();
  });
});
