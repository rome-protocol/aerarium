// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { YourBorrowsTable } from "../YourBorrowsTable";

const symbolByAsset = { "0xaa": "wUSDC" };
const decimalsByAsset = { "0xaa": 6 };

describe("YourBorrowsTable", () => {
  it("renders empty-state when borrowBalance is 0", () => {
    render(
      <YourBorrowsTable
        borrowBalance={0n}
        baseAsset={"0xaa" as `0x${string}`}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onRepay={() => {}}
        onBorrow={() => {}}
      />,
    );
    expect(screen.getByText(/no debt yet/i)).toBeInTheDocument();
  });

  it("renders the base row when borrowBalance > 0", () => {
    render(
      <YourBorrowsTable
        borrowBalance={500_000n}
        baseAsset={"0xaa" as `0x${string}`}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onRepay={() => {}}
        onBorrow={() => {}}
      />,
    );
    expect(screen.getByText("wUSDC")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2); // header + base
  });

  it("Repay button fires onRepay with the base asset address", () => {
    const onRepay = vi.fn();
    render(
      <YourBorrowsTable
        borrowBalance={500_000n}
        baseAsset={"0xaa" as `0x${string}`}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onRepay={onRepay}
        onBorrow={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Repay/i }));
    expect(onRepay).toHaveBeenCalledWith("0xaa");
  });

  it("Borrow button fires onBorrow with the base asset address", () => {
    const onBorrow = vi.fn();
    render(
      <YourBorrowsTable
        borrowBalance={500_000n}
        baseAsset={"0xaa" as `0x${string}`}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onRepay={() => {}}
        onBorrow={onBorrow}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Borrow more/i }));
    expect(onBorrow).toHaveBeenCalledWith("0xaa");
  });

  it("falls back to truncated address when symbol mapping missing", () => {
    render(
      <YourBorrowsTable
        borrowBalance={500_000n}
        baseAsset={"0xabcdef1234567890abcdef1234567890abcdef12" as `0x${string}`}
        symbolByAsset={{}}
        decimalsByAsset={{}}
        onRepay={() => {}}
        onBorrow={() => {}}
      />,
    );
    expect(screen.getByText(/0xabcd…ef12/)).toBeInTheDocument();
  });
});
