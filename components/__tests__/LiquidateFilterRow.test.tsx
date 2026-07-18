// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LiquidateFilterRow, type FilterState } from "../LiquidateFilterRow";

const defaults: FilterState = {
  hfThreshold: 1.1,
  collateralSymbol: null,
  debtSymbol: null,
  minSizeUSD: 0,
};

describe("LiquidateFilterRow", () => {
  it("renders HF / Collateral / Debt / Min size labels", () => {
    render(
      <LiquidateFilterRow
        value={defaults}
        onChange={() => {}}
        collatSymbols={["wHEAT", "wSALT"]}
        debtSymbols={["wUSDC"]}
        liveSeconds={6}
      />,
    );
    expect(screen.getByText(/HF/)).toBeInTheDocument();
    expect(screen.getByText(/Collateral/)).toBeInTheDocument();
    expect(screen.getByText(/Debt/)).toBeInTheDocument();
    expect(screen.getByText(/Min size/i)).toBeInTheDocument();
  });

  it("renders the Live tick indicator with the polling cadence", () => {
    render(
      <LiquidateFilterRow
        value={defaults}
        onChange={() => {}}
        collatSymbols={[]}
        debtSymbols={[]}
        liveSeconds={6}
      />,
    );
    expect(screen.getByText(/Live/i)).toBeInTheDocument();
    expect(screen.getByText(/6\s*s\s*tick/i)).toBeInTheDocument();
  });

  it("fires onChange when the HF threshold dropdown changes", () => {
    const onChange = vi.fn();
    render(
      <LiquidateFilterRow
        value={defaults}
        onChange={onChange}
        collatSymbols={[]}
        debtSymbols={[]}
        liveSeconds={6}
      />,
    );
    const hf = screen.getByLabelText(/HF threshold/i);
    fireEvent.change(hf, { target: { value: "1.05" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ hfThreshold: 1.05 }),
    );
  });

  it("fires onChange when the min-size input changes", () => {
    const onChange = vi.fn();
    render(
      <LiquidateFilterRow
        value={defaults}
        onChange={onChange}
        collatSymbols={[]}
        debtSymbols={[]}
        liveSeconds={6}
      />,
    );
    const min = screen.getByLabelText(/Minimum borrow size/i);
    fireEvent.change(min, { target: { value: "100" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ minSizeUSD: 100 }),
    );
  });

  it("collateral filter is 'Any' by default, switches when a symbol is picked", () => {
    const onChange = vi.fn();
    render(
      <LiquidateFilterRow
        value={defaults}
        onChange={onChange}
        collatSymbols={["wHEAT", "wSALT"]}
        debtSymbols={[]}
        liveSeconds={6}
      />,
    );
    const collat = screen.getByLabelText(/Collateral filter/i);
    expect((collat as HTMLSelectElement).value).toBe("");
    fireEvent.change(collat, { target: { value: "wHEAT" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ collateralSymbol: "wHEAT" }),
    );
  });
});
