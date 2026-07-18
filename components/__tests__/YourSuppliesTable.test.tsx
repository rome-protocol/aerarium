// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { YourSuppliesTable } from "../YourSuppliesTable";

const symbolByAsset = { "0xaa": "wUSDC", "0xcc": "wETH" };
const decimalsByAsset = { "0xaa": 6, "0xcc": 8 };

describe("YourSuppliesTable", () => {
  it("renders empty-state when user has no balances", () => {
    render(
      <YourSuppliesTable
        baseSupply={0n}
        baseAsset={"0xaa" as `0x${string}`}
        collatBalances={{}}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onSupply={() => {}}
        onWithdraw={() => {}}
      />,
    );
    expect(screen.getByText(/no supplies yet/i)).toBeInTheDocument();
  });

  it("renders the base row when baseSupply > 0", () => {
    render(
      <YourSuppliesTable
        baseSupply={1_000_000n}
        baseAsset={"0xaa" as `0x${string}`}
        collatBalances={{}}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onSupply={() => {}}
        onWithdraw={() => {}}
      />,
    );
    expect(screen.getByText("wUSDC")).toBeInTheDocument();
    // 1 header + 1 data row = 2 rows
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  it("renders a collat row when that collat balance is positive", () => {
    render(
      <YourSuppliesTable
        baseSupply={0n}
        baseAsset={"0xaa" as `0x${string}`}
        collatBalances={{ "0xcc": 1_000_000_000n }}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onSupply={() => {}}
        onWithdraw={() => {}}
      />,
    );
    expect(screen.getByText("wETH")).toBeInTheDocument();
  });

  it("omits collats whose balance is 0", () => {
    render(
      <YourSuppliesTable
        baseSupply={1_000_000n}
        baseAsset={"0xaa" as `0x${string}`}
        collatBalances={{ "0xcc": 0n }}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onSupply={() => {}}
        onWithdraw={() => {}}
      />,
    );
    expect(screen.queryByText("wETH")).not.toBeInTheDocument();
  });

  it("renders both base and collat rows when both are positive", () => {
    render(
      <YourSuppliesTable
        baseSupply={2_000_000n}
        baseAsset={"0xaa" as `0x${string}`}
        collatBalances={{ "0xcc": 5_000_000_000n }}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onSupply={() => {}}
        onWithdraw={() => {}}
      />,
    );
    expect(screen.getByText("wUSDC")).toBeInTheDocument();
    expect(screen.getByText("wETH")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 data
  });

  it("Withdraw button fires onWithdraw with the asset address", () => {
    const onWithdraw = vi.fn();
    render(
      <YourSuppliesTable
        baseSupply={1_000_000n}
        baseAsset={"0xaa" as `0x${string}`}
        collatBalances={{}}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onSupply={() => {}}
        onWithdraw={onWithdraw}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Withdraw/i }));
    expect(onWithdraw).toHaveBeenCalledWith("0xaa");
  });

  it("Supply button fires onSupply with the asset address", () => {
    const onSupply = vi.fn();
    render(
      <YourSuppliesTable
        baseSupply={1_000_000n}
        baseAsset={"0xaa" as `0x${string}`}
        collatBalances={{}}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onSupply={onSupply}
        onWithdraw={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Supply/i }));
    expect(onSupply).toHaveBeenCalledWith("0xaa");
  });
});
