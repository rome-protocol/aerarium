// @vitest-environment jsdom
//
// SelectedAssetStats sits in the lane-home rail just above the ActionPanel and
// shows the stats for the asset the user picked — APYs, price, their balances,
// and the binding limit (available liquidity for the base; supply-cap headroom
// for a collateral). This is the "more info on the right" the freed room buys.
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SelectedAssetStats } from "../SelectedAssetStats";
import type { LaneAsset, LanePosition } from "../types";

const position: LanePosition = {
  supplied: 1200, borrowed: 0, capacity: 800, healthFactor: 5, netApr: 1,
  assets: [], limits: { availableLiquidityUsd: 5000, baseBorrowMinUsd: 1 },
};
const baseAsset: LaneAsset = {
  sym: "wUSDC", name: "USD Coin", supplyApy: 5.18, borrowApy: 7.62, borrowable: true,
  walletBal: 900, suppliedBal: 1200, borrowedBal: 0, walletTokens: 900, suppliedTokens: 1200, borrowedTokens: 0, priceUsd: 1,
  borrowCollateralFactor: 0,
};
const collat: LaneAsset = {
  sym: "wETH", name: "Wrapped Ether", supplyApy: 2.41, borrowApy: 0, borrowable: false,
  walletBal: 6200, suppliedBal: 0, borrowedBal: 0, walletTokens: 2, suppliedTokens: 0, borrowedTokens: 0,
  priceUsd: 3100, collateral: true, supplyHeadroomTokens: 2, borrowCollateralFactor: 0.8,
};

describe("SelectedAssetStats — per-selected-asset rail panel", () => {
  it("shows supply + borrow APY for the asset", () => {
    render(<SelectedAssetStats asset={baseAsset} position={position} />);
    expect(screen.getByText("5.18%")).toBeInTheDocument();
    expect(screen.getByText("7.62%")).toBeInTheDocument();
  });

  it("shows the asset price and the user's wallet + supplied balances", () => {
    render(<SelectedAssetStats asset={baseAsset} position={position} />);
    expect(screen.getByText("$1.00")).toBeInTheDocument(); // price
    expect(screen.getByText("$900.00")).toBeInTheDocument(); // wallet
    expect(screen.getByText("$1,200.00")).toBeInTheDocument(); // supplied
  });

  it("for the BASE asset, surfaces available liquidity as the binding limit", () => {
    render(<SelectedAssetStats asset={baseAsset} position={position} />);
    const row = screen.getByText(/available liquidity/i).closest("div")!;
    expect(within(row).getByText("$5,000.00")).toBeInTheDocument();
  });

  it("for a COLLATERAL, surfaces supply-cap headroom instead", () => {
    render(<SelectedAssetStats asset={collat} position={position} />);
    expect(screen.getByText(/supply cap headroom/i)).toBeInTheDocument();
    expect(screen.getByText(/2\s*wETH/)).toBeInTheDocument();
    // borrow APY is "—" for a non-borrowable collateral
    expect(screen.queryByText(/available liquidity/i)).toBeNull();
  });
});
