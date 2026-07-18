// @vitest-environment jsdom
//
// Lane-home AssetTable is now a click-to-SELECT list: clicking a row picks the
// asset (drives the rail's stats + ActionPanel), and the per-row
// Supply/Borrow/Withdraw button column is GONE (the ActionPanel owns all four
// actions). Rows are accessible (role=button, keyboard-operable) and the active
// row is marked. This is the lane home only — the dashboard's DashboardPositions
// keeps its action buttons (those deep-link; no adjacent panel there).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetTable } from "../AssetTable";
import type { LaneAsset } from "../types";

const assets: LaneAsset[] = [
  { sym: "wUSDC", name: "USD Coin", address: "0x9a8b4cb7", supplyApy: 5, borrowApy: 7, borrowable: true, walletBal: 900, suppliedBal: 0, borrowedBal: 0, walletTokens: 900, suppliedTokens: 0, borrowedTokens: 0, priceUsd: 1, borrowCollateralFactor: 0 },
  { sym: "wETH", name: "Wrapped Ether", address: "0x55e4502d", supplyApy: 2, borrowApy: 0, borrowable: false, walletBal: 0, suppliedBal: 3100, borrowedBal: 0, walletTokens: 0, suppliedTokens: 1, borrowedTokens: 0, priceUsd: 3100, collateral: true, borrowCollateralFactor: 0.8 },
];

// Reproduces the EVM-lane intermediate state: before the async on-chain symbol
// read resolves, EVERY collateral falls back to sym "asset" (mapEvmPosition).
// Keyed by symbol, React collides on the duplicate "asset" key and ghosts/omits
// rows on the relabel re-render (the "9 asset rows + the real ones" duplication
// the operator hit). Keyed by the unique on-chain address each row is distinct.
const dupSymbolAssets: LaneAsset[] = [
  { sym: "asset", name: "asset", address: "0x55e4502d", supplyApy: 0, borrowApy: 0, borrowable: false, walletBal: 0, suppliedBal: 17.72, borrowedBal: 0, walletTokens: 0, suppliedTokens: 0.01, borrowedTokens: 0, priceUsd: 0, collateral: true, borrowCollateralFactor: 0.8 },
  { sym: "asset", name: "asset", address: "0x8c965f79", supplyApy: 0, borrowApy: 0, borrowable: false, walletBal: 0.33, suppliedBal: 0, borrowedBal: 0, walletTokens: 200, suppliedTokens: 0, borrowedTokens: 0, priceUsd: 0, collateral: true, borrowCollateralFactor: 0.8 },
  { sym: "asset", name: "asset", address: "0xa000137f", supplyApy: 0, borrowApy: 0, borrowable: false, walletBal: 0, suppliedBal: 121497.7, borrowedBal: 0, walletTokens: 0, suppliedTokens: 1, borrowedTokens: 0, priceUsd: 0, collateral: true, borrowCollateralFactor: 0.8 },
];

describe("AssetTable — click-to-select rows (no per-row action buttons)", () => {
  it("clicking a row selects that asset via onSelect(sym)", () => {
    const onSelect = vi.fn();
    render(<AssetTable title="Assets" assets={assets} onSelect={onSelect} activeSym="" />);
    fireEvent.click(screen.getByText("wETH").closest("[role='button']")!);
    expect(onSelect).toHaveBeenCalledWith("wETH");
  });

  it("renders NO per-row Supply/Borrow/Withdraw action buttons", () => {
    render(<AssetTable title="Assets" assets={assets} onSelect={() => {}} activeSym="" />);
    expect(screen.queryByRole("button", { name: /^supply$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^borrow$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^withdraw$/i })).toBeNull();
  });

  it("marks the active row as selected (aria-pressed)", () => {
    render(<AssetTable title="Assets" assets={assets} onSelect={() => {}} activeSym="wETH" />);
    const row = screen.getByText("wETH").closest("[role='button']")!;
    expect(row).toHaveAttribute("aria-pressed", "true");
  });

  it("is keyboard-operable (Enter selects the focused row)", () => {
    const onSelect = vi.fn();
    render(<AssetTable title="Assets" assets={assets} onSelect={onSelect} activeSym="" />);
    fireEvent.keyDown(screen.getByText("wUSDC").closest("[role='button']")!, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("wUSDC");
  });

  it("shows each asset's on-chain address (truncated) underneath the symbol", () => {
    render(<AssetTable title="Assets" assets={assets} onSelect={() => {}} activeSym="" />);
    // The on-chain identity is shown under the symbol (EVM addr / Solana mint).
    // short() leaves these <=13-char fixtures unchanged.
    expect(screen.getByText("0x9a8b4cb7")).toBeInTheDocument();
    expect(screen.getByText("0x55e4502d")).toBeInTheDocument();
  });

  it("renders one row per asset with NO duplicate-key warning when several share a symbol", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AssetTable title="Assets" assets={dupSymbolAssets} onSelect={() => {}} activeSym="" />);
    // All three distinct assets render (not collapsed by the shared "asset" symbol).
    expect(screen.getAllByRole("button")).toHaveLength(dupSymbolAssets.length);
    // And React must NOT warn about duplicate keys — i.e. rows are keyed by the
    // unique address, not the (colliding) symbol. This is the operator's console error.
    const dupKeyWarning = spy.mock.calls.some((c) => c.some((arg) => String(arg).includes("same key")));
    spy.mockRestore();
    expect(dupKeyWarning).toBe(false);
  });
});
