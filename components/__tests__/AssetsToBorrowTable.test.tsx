// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetsToBorrowTable } from "../AssetsToBorrowTable";
import type { ReserveStat } from "@/lib/portal/hooks/useReserveStats";

const reserves: ReserveStat[] = [
  {
    kind: "base",
    asset: "0xaa" as `0x${string}`,
    priceFeed: "0xbb" as `0x${string}`,
    decimals: 6,
    totalSupplyRaw: 5_000_000n,
    totalSupplyUSD: 5,
    totalBorrowRaw: 1_000_000n,
    totalBorrowUSD: 1,
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

const symbolByAsset = { "0xaa": "wUSDC" };

describe("AssetsToBorrowTable", () => {
  it("renders exactly 1 data row (the base asset only) + header", () => {
    render(<AssetsToBorrowTable reserves={reserves} symbolByAsset={symbolByAsset} onBorrow={() => {}} />);
    expect(screen.getAllByRole("row")).toHaveLength(2); // header + base
  });

  it("displays the borrow APY for base (6.12%)", () => {
    render(<AssetsToBorrowTable reserves={reserves} symbolByAsset={symbolByAsset} onBorrow={() => {}} />);
    expect(screen.getByText("6.12%")).toBeInTheDocument();
  });

  it("Available cell = totalSupplyUSD - totalBorrowUSD ($4)", () => {
    render(<AssetsToBorrowTable reserves={reserves} symbolByAsset={symbolByAsset} onBorrow={() => {}} />);
    // 5 - 1 = $4
    expect(screen.getByText(/\$4/)).toBeInTheDocument();
  });

  it("Borrow button fires onBorrow with the base asset address", () => {
    const onBorrow = vi.fn();
    render(<AssetsToBorrowTable reserves={reserves} symbolByAsset={symbolByAsset} onBorrow={onBorrow} />);
    fireEvent.click(screen.getByRole("button", { name: /Borrow/i }));
    expect(onBorrow).toHaveBeenCalledWith("0xaa");
  });

  it("renders loading skeleton when reserves is null", () => {
    render(<AssetsToBorrowTable reserves={null} symbolByAsset={{}} onBorrow={() => {}} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("falls back to empty-state message when no base reserve found", () => {
    const onlyCollats = reserves.filter((r) => r.kind === "collateral");
    render(<AssetsToBorrowTable reserves={onlyCollats} symbolByAsset={{}} onBorrow={() => {}} />);
    expect(screen.getByText(/no base asset/i)).toBeInTheDocument();
  });

  it("Borrow button is enabled by default", () => {
    render(<AssetsToBorrowTable reserves={reserves} symbolByAsset={symbolByAsset} onBorrow={() => {}} />);
    expect(screen.getByRole("button", { name: /Borrow/i })).toBeEnabled();
  });

  it("Borrow button is disabled when disabled=true (wallet not connected)", () => {
    render(
      <AssetsToBorrowTable
        reserves={reserves}
        symbolByAsset={symbolByAsset}
        onBorrow={() => {}}
        disabled
      />,
    );
    expect(screen.getByRole("button", { name: /Borrow/i })).toBeDisabled();
  });
});
