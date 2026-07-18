// @vitest-environment jsdom
//
// The dashboard's per-asset action buttons deep-link to the lane home with
// ?asset=&action= (so the dashboard never re-hosts the action flow). LaneApp
// honors those params: it seeds the selected asset + action from them, so the
// ActionPanel opens pre-set. Absent/invalid params fall back to the first asset
// + "supply" (current behavior — existing callers pass neither prop).
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LaneApp } from "../LaneApp";
import type { LaneAdapter, LanePosition } from "../types";

const position: LanePosition = {
  supplied: 1200, borrowed: 0, capacity: 800, healthFactor: 5, netApr: 2,
  assets: [
    { sym: "wUSDC", name: "USD Coin", supplyApy: 5, borrowApy: 7, borrowable: true, walletBal: 900, suppliedBal: 1200, borrowedBal: 0, walletTokens: 900, suppliedTokens: 1200, borrowedTokens: 0, priceUsd: 1, borrowCollateralFactor: 0 },
    { sym: "wETH", name: "Wrapped Ether", supplyApy: 2, borrowApy: 0, borrowable: false, walletBal: 0, suppliedBal: 3100, borrowedBal: 0, walletTokens: 0, suppliedTokens: 1, borrowedTokens: 0, priceUsd: 3100, collateral: true, borrowCollateralFactor: 0.8 },
  ],
  limits: { availableLiquidityUsd: 5000, baseBorrowMinUsd: 1 },
};

function adapter(over: Partial<LaneAdapter> = {}): LaneAdapter {
  return {
    chain: "evm", wallets: ["MetaMask"],
    connection: { status: "connected", address: "0xabc", wallet: "MetaMask" },
    connect: () => {}, disconnect: () => {},
    provisioned: true, activating: false, activateStep: 0, activate: () => {},
    position, hasPosition: true, positionLoading: false,
    activity: [], lastResult: null,
    submitAction: () => {}, signing: false, signStep: 0, signPlan: [],
    error: null, clearError: () => {},
    ...over,
  };
}

describe("LaneApp deep-link (?asset & ?action from the dashboard)", () => {
  it("opens the action panel pre-set to the deep-linked asset + action", () => {
    render(<LaneApp adapter={adapter()} initialAsset="wUSDC" initialAction="borrow" />);
    expect(screen.getByText(/Borrow\s+0\.00\s+wUSDC/i)).toBeInTheDocument();
  });

  it("defaults to supply + first asset when no deep-link params are given", () => {
    render(<LaneApp adapter={adapter()} />);
    expect(screen.getByText(/Supply\s+0\.00\s+wUSDC/i)).toBeInTheDocument();
  });
});
