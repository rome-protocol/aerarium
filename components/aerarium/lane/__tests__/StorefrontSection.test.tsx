// @vitest-environment jsdom
//
// StorefrontSection is the read-only "seized collateral for sale" panel on the
// dashboard. It surfaces the buyCollateral OPPORTUNITY (which collateral the
// protocol holds for sale after a liquidation) without the live buy action
// (that's a funded follow-up — buyCollateral reverts NotForSale until a real
// absorb). Empty-state in the common case (nothing seized); a table when open.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StorefrontSection } from "../StorefrontSection";
import type { Storefront } from "@/lib/portal/storefront";

describe("StorefrontSection — read-only seized-collateral storefront", () => {
  it("shows the empty-state when the storefront is closed (the common case)", () => {
    render(<StorefrontSection storefront={{ open: false, items: [] }} loading={false} />);
    expect(screen.getByText(/no seized collateral for sale/i)).toBeInTheDocument();
  });

  it("lists for-sale collateral (symbol + available units) when the storefront is open", () => {
    const sf: Storefront = {
      open: true,
      items: [{ asset: "0x1111111111111111111111111111111111111111", symbol: "wETH", availableTokens: 2.5 }],
    };
    render(<StorefrontSection storefront={sf} loading={false} />);
    expect(screen.getByText("wETH")).toBeInTheDocument();
    expect(screen.getByText(/2\.5/)).toBeInTheDocument();
  });

  it("shows a loading state while the storefront is being checked", () => {
    render(<StorefrontSection storefront={null} loading />);
    expect(screen.getByText(/checking the storefront/i)).toBeInTheDocument();
  });
});
