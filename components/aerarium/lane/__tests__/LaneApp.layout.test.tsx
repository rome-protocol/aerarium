// @vitest-environment jsdom
//
// Lane-home layout: the ACTION panel (supply/withdraw/borrow/repay) must be the
// prominent element — left column, first thing the eye hits — NOT buried in the
// right rail below the selected-asset stats (where users couldn't find it). The
// asset list moves to the right column. This pins the column assignment so a
// regression can't re-bury the action.
import { describe, it, expect, beforeEach } from "vitest";
import { render, within } from "@testing-library/react";
import { LaneApp } from "../LaneApp";
import { getLastLane } from "@/lib/lastLane";
import type { LaneAdapter, LanePosition } from "../types";

const position: LanePosition = {
  supplied: 1200, borrowed: 0, capacity: 800, healthFactor: 5, netApr: 2,
  assets: [
    { sym: "wUSDC", name: "USD Coin", supplyApy: 5, borrowApy: 7, borrowable: true, walletBal: 900, suppliedBal: 1200, borrowedBal: 0, walletTokens: 900, suppliedTokens: 1200, borrowedTokens: 0, priceUsd: 1, borrowCollateralFactor: 0 },
  ],
  limits: { availableLiquidityUsd: 5000, baseBorrowMinUsd: 1 },
};

function adapter(): LaneAdapter {
  return {
    chain: "evm", wallets: ["MetaMask"],
    connection: { status: "connected", address: "0xabc", wallet: "MetaMask" },
    connect: () => {}, disconnect: () => {},
    provisioned: true, activating: false, activateStep: 0, activate: () => {},
    position, hasPosition: true, positionLoading: false,
    activity: [], lastResult: null,
    submitAction: () => {}, signing: false, signStep: 0, signPlan: [],
    error: null, clearError: () => {},
  };
}

describe("LaneApp lane-home layout — action LEFT, assets RIGHT", () => {
  it("puts the action panel in the left grid column and the asset list in the right", () => {
    const { container } = render(<LaneApp adapter={adapter()} />);
    const grid = container.querySelector(".aer-app-grid")!;
    const left = grid.children[0] as HTMLElement;
    const right = grid.children[1] as HTMLElement;
    // ActionPanel ("Amount" field label) is on the LEFT — prominent, not buried.
    expect(within(left).getByText("Amount")).toBeInTheDocument();
    // The asset list ("Select an asset to act") is on the RIGHT.
    expect(within(right).getByText(/select an asset to act/i)).toBeInTheDocument();
  });

  it("renders the action panel ABOVE the selected-asset stats (stats never bury the action)", () => {
    const { container } = render(<LaneApp adapter={adapter()} />);
    const left = (container.querySelector(".aer-app-grid")!.children[0]) as HTMLElement;
    const amount = within(left).getByText("Amount");           // in ActionPanel
    const priceLabel = within(left).getByText(/^price$/i);      // in SelectedAssetStats
    // action comes BEFORE stats in DOM (so it's on top)
    expect(amount.compareDocumentPosition(priceLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("LaneApp — remembers the lane for the returning-user fast path", () => {
  beforeEach(() => localStorage.clear());
  it("stores the lane on mount so the landing can offer a Resume link", () => {
    render(<LaneApp adapter={adapter()} />);
    expect(getLastLane()).toBe("evm");
  });
});
