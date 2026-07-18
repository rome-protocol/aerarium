// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AllReservesTable } from "../AllReservesTable";
import type { ReserveStat } from "@/lib/portal/hooks/useReserveStats";

const fixture: ReserveStat[] = [
  {
    kind: "base",
    asset: "0xaa" as `0x${string}`,
    priceFeed: "0xbb" as `0x${string}`,
    decimals: 6,
    totalSupplyRaw: 1_000_000n,
    totalSupplyUSD: 1,
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

const symbolByAsset: Record<string, string> = {
  "0xaa": "wUSDC",
  "0xcc": "wETH",
};

describe("AllReservesTable", () => {
  it("renders one row per reserve plus a header row", () => {
    render(<AllReservesTable reserves={fixture} symbolByAsset={symbolByAsset} />);
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 data rows
  });

  it("base row shows supply APY (4.21%) and borrow APY (6.12%)", () => {
    render(<AllReservesTable reserves={fixture} symbolByAsset={symbolByAsset} />);
    expect(screen.getByText("4.21%")).toBeInTheDocument();
    expect(screen.getByText("6.12%")).toBeInTheDocument();
  });

  it("collateral row uses em-dash for inapplicable cells (supplyApy, totalBorrow, borrowApy)", () => {
    render(<AllReservesTable reserves={fixture} symbolByAsset={symbolByAsset} />);
    const collatRow = screen.getByText("wETH").closest("tr")!;
    expect(collatRow.textContent).toContain("—");
  });

  it("base row shows '—' in the Borrow CF column (CF doesn't apply to base)", () => {
    render(<AllReservesTable reserves={fixture} symbolByAsset={symbolByAsset} />);
    const baseRow = screen.getByText("wUSDC").closest("tr")!;
    // Last cell of base row should be '—' (Borrow CF column)
    const cells = baseRow.querySelectorAll("td");
    expect(cells[cells.length - 1].textContent).toBe("—");
  });

  it("collateral row shows '70%' in the Borrow CF column", () => {
    render(<AllReservesTable reserves={fixture} symbolByAsset={symbolByAsset} />);
    const collatRow = screen.getByText("wETH").closest("tr")!;
    expect(collatRow.textContent).toContain("70%");
  });

  it("renders a loading skeleton when reserves is null", () => {
    render(<AllReservesTable reserves={null} symbolByAsset={{}} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("falls back to a truncated address when no symbol mapping exists for an asset", () => {
    render(<AllReservesTable reserves={fixture} symbolByAsset={{}} />);
    // Should show truncated 0xaa… or similar, not throw
    const baseRow = screen.getAllByRole("row")[1];
    expect(baseRow.textContent).toMatch(/0xaa/i);
  });

  it("base row shows the asset quantity AND its USD subline (e.g. '1' / '$1')", () => {
    render(<AllReservesTable reserves={fixture} symbolByAsset={symbolByAsset} />);
    const baseRow = screen.getByText("wUSDC").closest("tr")!;
    // Quantity = totalSupplyRaw / 10**decimals = 1_000_000 / 1e6 = 1
    expect(baseRow.textContent).toMatch(/(^|\D)1(\D|$)/);
    // USD subline format renders the $ inline near the quantity
    expect(baseRow.textContent).toMatch(/\$1/);
  });

  it("colors supply APY using the supply hue (--hf-safe) and borrow APY the borrow hue (--hf-warn)", () => {
    render(<AllReservesTable reserves={fixture} symbolByAsset={symbolByAsset} />);
    const supplyCell = screen.getByText("4.21%");
    const borrowCell = screen.getByText("6.12%");
    // Inline styles surface via the style attribute on the rendered span.
    expect(supplyCell.getAttribute("style")).toMatch(/--hf-safe|var\(--hf-safe\)/);
    expect(borrowCell.getAttribute("style")).toMatch(/--hf-warn|var\(--hf-warn\)/);
  });
});
