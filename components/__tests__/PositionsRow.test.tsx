// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PositionsRow } from "../PositionsRow";

describe("PositionsRow", () => {
  it("renders both children", () => {
    const { getByText } = render(
      <PositionsRow
        suppliesSlot={<div>SUPPLIES_HERE</div>}
        borrowsSlot={<div>BORROWS_HERE</div>}
      />,
    );
    expect(getByText("SUPPLIES_HERE")).toBeInTheDocument();
    expect(getByText("BORROWS_HERE")).toBeInTheDocument();
  });

  it("lays children out in a 2-column grid at desktop widths", () => {
    const { getByTestId } = render(
      <PositionsRow
        suppliesSlot={<div>S</div>}
        borrowsSlot={<div>B</div>}
      />,
    );
    const row = getByTestId("positions-row");
    expect(row).toHaveStyle({ display: "grid" });
    // Two equal columns — implemented as repeat(2, minmax(0, 1fr)) so the
    // table content can shrink rather than overflow when the parent is narrow.
    const cols = (row.style.gridTemplateColumns || "").toLowerCase();
    expect(cols).toMatch(/(1fr 1fr|repeat\s*\(\s*2\s*,)/);
  });

  it("supplies slot precedes borrows slot in DOM order (read pattern)", () => {
    const { getByText } = render(
      <PositionsRow
        suppliesSlot={<div>SUPPLIES_HERE</div>}
        borrowsSlot={<div>BORROWS_HERE</div>}
      />,
    );
    const supplies = getByText("SUPPLIES_HERE");
    const borrows = getByText("BORROWS_HERE");
    // bitmask 4 = following — supplies must precede borrows in document order
    expect(supplies.compareDocumentPosition(borrows) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
