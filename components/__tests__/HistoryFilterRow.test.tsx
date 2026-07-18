// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HistoryFilterRow, type HistoryFilterState } from "../HistoryFilterRow";

const defaults: HistoryFilterState = {
  kind: null,
  symbol: null,
};

describe("HistoryFilterRow", () => {
  it("renders Type / Asset labels", () => {
    render(
      <HistoryFilterRow
        value={defaults}
        onChange={() => {}}
        assetSymbols={["wUSDC", "wETH"]}
        eventCount={26}
      />,
    );
    expect(screen.getByText(/Type/)).toBeInTheDocument();
    expect(screen.getByText(/Asset/)).toBeInTheDocument();
  });

  it("renders the event count chip", () => {
    render(
      <HistoryFilterRow
        value={defaults}
        onChange={() => {}}
        assetSymbols={[]}
        eventCount={26}
      />,
    );
    expect(screen.getByText(/26\s+events/i)).toBeInTheDocument();
  });

  it("Type defaults to All; switching to a kind fires onChange", () => {
    const onChange = vi.fn();
    render(
      <HistoryFilterRow
        value={defaults}
        onChange={onChange}
        assetSymbols={[]}
        eventCount={0}
      />,
    );
    const type = screen.getByLabelText(/Type filter/i);
    expect((type as HTMLSelectElement).value).toBe("");
    fireEvent.change(type, { target: { value: "supply" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "supply" }),
    );
  });

  it("Asset filter switches when a symbol is picked", () => {
    const onChange = vi.fn();
    render(
      <HistoryFilterRow
        value={defaults}
        onChange={onChange}
        assetSymbols={["wUSDC", "wETH"]}
        eventCount={0}
      />,
    );
    const asset = screen.getByLabelText(/Asset filter/i);
    fireEvent.change(asset, { target: { value: "wETH" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "wETH" }),
    );
  });
});
