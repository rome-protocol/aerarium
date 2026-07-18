// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarketStatStrip } from "../MarketStatStrip";

describe("MarketStatStrip", () => {
  it("renders all four labelled fields when data is present", () => {
    render(
      <MarketStatStrip
        marketName="Rome Hadrian"
        chainId={200010}
        totalSupplyUSD={4990}
        availableUSD={4970}
        totalBorrowUSD={12.4}
      />,
    );
    expect(screen.getByText(/Market/i)).toBeInTheDocument();
    expect(screen.getByText("Rome Hadrian")).toBeInTheDocument();
    expect(screen.getByText(/Total supply/i)).toBeInTheDocument();
    expect(screen.getByText(/Available/i)).toBeInTheDocument();
    expect(screen.getByText(/Total borrow/i)).toBeInTheDocument();
  });

  it("formats USD figures with K compaction over $1000", () => {
    render(
      <MarketStatStrip
        marketName="Rome Hadrian"
        chainId={200010}
        totalSupplyUSD={4990}
        availableUSD={4970}
        totalBorrowUSD={12.4}
      />,
    );
    expect(screen.getByText("$4.99K")).toBeInTheDocument();
    expect(screen.getByText("$4.97K")).toBeInTheDocument();
    expect(screen.getByText("$12.40")).toBeInTheDocument();
  });

  it("shows em-dash placeholders when figures are null (pre-load)", () => {
    render(
      <MarketStatStrip
        marketName="Rome Hadrian"
        chainId={200010}
        totalSupplyUSD={null}
        availableUSD={null}
        totalBorrowUSD={null}
      />,
    );
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(3);
  });

  it("renders the chain id pinned-right as a meta annotation", () => {
    render(
      <MarketStatStrip
        marketName="Rome Hadrian"
        chainId={200010}
        totalSupplyUSD={4990}
        availableUSD={4970}
        totalBorrowUSD={12.4}
      />,
    );
    // Chain pill shows "Rome Hadrian · 200010" or similar — must contain the chainId
    expect(screen.getByText(/200010/)).toBeInTheDocument();
  });
});
