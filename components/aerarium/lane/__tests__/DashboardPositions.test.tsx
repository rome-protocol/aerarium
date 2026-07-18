// @vitest-environment jsdom
//
// DashboardPositions is the read-first per-asset breakdown for the dedicated
// /…/dashboard pages: every asset with the user's supplied / borrowed / wallet
// balances side-by-side (the lane home's AssetTable shows only ONE balance per
// row), and the Supply/Borrow/Withdraw actions DEEP-LINK to the lane home's
// action surface (via the injected actionHref) rather than re-hosting the
// action flow — so the dashboard doesn't duplicate the lane's ActionPanel.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DashboardPositions } from "../DashboardPositions";
import type { LaneAsset } from "../types";

const assets: LaneAsset[] = [
  { sym: "wUSDC", name: "USD Coin", supplyApy: 5.18, borrowApy: 7.62, borrowable: true, walletBal: 900, suppliedBal: 1200, borrowedBal: 0, walletTokens: 900, suppliedTokens: 1200, borrowedTokens: 0, priceUsd: 1, borrowCollateralFactor: 0 },
  { sym: "wETH", name: "Wrapped Ether", supplyApy: 2.41, borrowApy: 0, borrowable: false, walletBal: 0, suppliedBal: 3100, borrowedBal: 0, walletTokens: 0, suppliedTokens: 1, borrowedTokens: 0, priceUsd: 3100, collateral: true, borrowCollateralFactor: 0.8 },
];
const href = (action: string, sym: string) => `/evm?asset=${sym}&action=${action}`;

describe("DashboardPositions — read-first per-asset breakdown with deep-link actions", () => {
  it("renders the full per-asset columns (supplied + borrowed + wallet, not just one balance)", () => {
    render(<DashboardPositions assets={assets} actionHref={href} />);
    expect(screen.getByRole("columnheader", { name: /asset/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /supplied/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /borrowed/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /wallet/i })).toBeInTheDocument();
  });

  it("shows the user's real supplied + wallet USD per asset", () => {
    render(<DashboardPositions assets={assets} actionHref={href} />);
    const row = screen.getByText("wUSDC").closest("tr")!;
    expect(within(row).getByText("$1,200.00")).toBeInTheDocument(); // supplied
    expect(within(row).getByText("$900.00")).toBeInTheDocument(); // wallet
  });

  it("deep-links Supply + Borrow to the lane action surface for a borrowable asset", () => {
    render(<DashboardPositions assets={assets} actionHref={href} />);
    const row = screen.getByText("wUSDC").closest("tr")!;
    expect(within(row).getByRole("link", { name: /supply/i })).toHaveAttribute("href", "/evm?asset=wUSDC&action=supply");
    expect(within(row).getByRole("link", { name: /borrow/i })).toHaveAttribute("href", "/evm?asset=wUSDC&action=borrow");
  });

  it("a collateral-only (non-borrowable) asset deep-links Withdraw, not Borrow", () => {
    render(<DashboardPositions assets={assets} actionHref={href} />);
    const row = screen.getByText("wETH").closest("tr")!;
    expect(within(row).getByRole("link", { name: /withdraw/i })).toHaveAttribute("href", "/evm?asset=wETH&action=withdraw");
    expect(within(row).queryByRole("link", { name: /^borrow$/i })).toBeNull();
  });

  it("renders one row per asset with NO duplicate-key warning when several share a symbol", () => {
    // Same class of bug AssetTable had: before the on-chain symbol resolves every
    // collateral falls back to sym "asset"; keyed by symbol the rows collide and
    // React ghosts/omits them. Keyed by the unique address each row is distinct.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dup: LaneAsset[] = [
      { sym: "asset", name: "asset", address: "0x55e4502d", supplyApy: 0, borrowApy: 0, borrowable: false, walletBal: 0, suppliedBal: 17.72, borrowedBal: 0, walletTokens: 0, suppliedTokens: 0.01, borrowedTokens: 0, priceUsd: 0, collateral: true, borrowCollateralFactor: 0.8 },
      { sym: "asset", name: "asset", address: "0x8c965f79", supplyApy: 0, borrowApy: 0, borrowable: false, walletBal: 0.33, suppliedBal: 0, borrowedBal: 0, walletTokens: 200, suppliedTokens: 0, borrowedTokens: 0, priceUsd: 0, collateral: true, borrowCollateralFactor: 0.8 },
      { sym: "asset", name: "asset", address: "0xa000137f", supplyApy: 0, borrowApy: 0, borrowable: false, walletBal: 0, suppliedBal: 121497.7, borrowedBal: 0, walletTokens: 0, suppliedTokens: 1, borrowedTokens: 0, priceUsd: 0, collateral: true, borrowCollateralFactor: 0.8 },
    ];
    render(<DashboardPositions assets={dup} actionHref={href} />);
    expect(screen.getAllByRole("row")).toHaveLength(dup.length + 1); // + header row
    const dupKeyWarning = spy.mock.calls.some((c) => c.some((arg) => String(arg).includes("same key")));
    spy.mockRestore();
    expect(dupKeyWarning).toBe(false);
  });

  it("keeps supplied collateral VISIBLE when its price feed is stale (token amount, not '—')", () => {
    // The live bug: wBTC getPrice reverts StalePriceFeed → suppliedBal USD = $0,
    // so the row rendered "—" and the user thought their 1.001 wBTC was gone.
    const staleAssets: LaneAsset[] = [
      { sym: "wBTC", name: "Wrapped Bitcoin", supplyApy: 0, borrowApy: 0, borrowable: false, walletBal: 0, suppliedBal: 0, borrowedBal: 0, walletTokens: 0, suppliedTokens: 1.001, borrowedTokens: 0, priceUsd: 0, priceKnown: false, collateral: true, borrowCollateralFactor: 0.8 },
    ];
    render(<DashboardPositions assets={staleAssets} actionHref={href} />);
    const row = screen.getByText("wBTC").closest("tr")!;
    expect(within(row).getByText("1.001 wBTC")).toBeInTheDocument();
  });
});
