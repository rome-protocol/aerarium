// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetsToSupplyTable } from "../AssetsToSupplyTable";
import type { ReserveStat } from "@/lib/portal/hooks/useReserveStats";

const reserves: ReserveStat[] = [
  {
    kind: "base",
    asset: "0xaa" as `0x${string}`,
    priceFeed: "0xbb" as `0x${string}`,
    decimals: 6,
    totalSupplyRaw: 0n,
    totalSupplyUSD: 0,
    totalBorrowRaw: 0n,
    totalBorrowUSD: 0,
    supplyApyPct: 4.21,
    borrowApyPct: 6.12,
    borrowCollateralFactorPct: 0,
  },
  {
    kind: "collateral",
    asset: "0xcc" as `0x${string}`,
    priceFeed: "0xdd" as `0x${string}`,
    decimals: 8,
    totalSupplyRaw: 0n,
    totalSupplyUSD: 0,
    totalBorrowRaw: null,
    totalBorrowUSD: null,
    supplyApyPct: null,
    borrowApyPct: null,
    borrowCollateralFactorPct: 70,
  },
];

const balances = { "0xaa": 12_500_000n, "0xcc": 1_000_000_000n };
const symbolByAsset = { "0xaa": "wUSDC", "0xcc": "wETH" };
const decimalsByAsset = { "0xaa": 6, "0xcc": 8 };

describe("AssetsToSupplyTable", () => {
  it("renders one row per reserve plus a header row", () => {
    render(
      <AssetsToSupplyTable
        reserves={reserves}
        balances={balances}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onSupply={() => {}}
      />,
    );
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 data
  });

  it("base row shows supply APY (4.21%); collat row uses '—'", () => {
    render(
      <AssetsToSupplyTable
        reserves={reserves}
        balances={balances}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onSupply={() => {}}
      />,
    );
    expect(screen.getByText("4.21%")).toBeInTheDocument();
    const collatRow = screen.getByText("wETH").closest("tr")!;
    expect(collatRow.textContent).toContain("—");
  });

  it("'Can be collateral' shows 'Yes' for collat (CF > 0) and 'No' for base (CF = 0)", () => {
    render(
      <AssetsToSupplyTable
        reserves={reserves}
        balances={balances}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onSupply={() => {}}
      />,
    );
    const baseRow = screen.getByText("wUSDC").closest("tr")!;
    const collatRow = screen.getByText("wETH").closest("tr")!;
    expect(baseRow.textContent).toMatch(/No/);
    expect(collatRow.textContent).toMatch(/Yes/);
  });

  it("Supply button fires onSupply with the asset address", () => {
    const onSupply = vi.fn();
    render(
      <AssetsToSupplyTable
        reserves={reserves}
        balances={balances}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onSupply={onSupply}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: /Supply/i });
    fireEvent.click(buttons[0]);
    expect(onSupply).toHaveBeenCalledWith("0xaa");
  });

  it("disables Supply button when wallet balance is zero", () => {
    const balancesZero = { "0xaa": 0n, "0xcc": 0n };
    render(
      <AssetsToSupplyTable
        reserves={reserves}
        balances={balancesZero}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onSupply={() => {}}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: /Supply/i });
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });

  it("renders zero balance when balances map is null (unconnected wallet)", () => {
    render(
      <AssetsToSupplyTable
        reserves={reserves}
        balances={null}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onSupply={() => {}}
      />,
    );
    // Both rows should still render, balance = "0"
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getAllByText("0")).toHaveLength(2);
  });

  it("renders loading skeleton when reserves is null", () => {
    render(
      <AssetsToSupplyTable
        reserves={null}
        balances={null}
        symbolByAsset={{}}
        decimalsByAsset={{}}
        onSupply={() => {}}
      />,
    );
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});
