// @vitest-environment jsdom
//
// LiquidateView is read-only browsable when DISCONNECTED: the rich table +
// HF filter + the manual-entry Check (all reads) stay usable, and ONLY the
// write action (Absorb) is gated — it becomes "Connect to absorb" and routes
// to onConnect instead of onAbsorb. When connected (the default), Absorb runs
// the real absorb as before. This is the seam that lets the liquidate pages
// un-gate the list while keeping the signer-only action behind connect.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { LiquidateView } from "../LiquidateView";
import type { LiquidatableInfo } from "@/lib/portal/enrichLiquidatable";

const ACC: LiquidatableInfo = {
  address: "0x1111111111111111111111111111111111111111",
  debtUsd: 1200,
  collateralUsd: 1500,
  bonusPct: 8,
  healthFactor: 0.88,
};

describe("LiquidateView — read-only when disconnected, absorb gated to connect", () => {
  it("when disconnected, the list + filter still render and the row action is 'Connect to absorb' → onConnect (never onAbsorb)", () => {
    const onAbsorb = vi.fn(async () => ({}));
    const onConnect = vi.fn();
    render(
      <LiquidateView accounts={[ACC]} loading={false} onAbsorb={onAbsorb} connected={false} onConnect={onConnect} />,
    );
    // The list is browsable read-only — the table header is present.
    expect(screen.getByRole("columnheader", { name: /Borrower/i })).toBeInTheDocument();
    // The per-row write action is gated to a connect prompt.
    const row = screen.getByText(/0x1111…1111/i).closest("tr")!;
    const gateBtn = within(row).getByRole("button", { name: /connect to absorb/i });
    fireEvent.click(gateBtn);
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onAbsorb).not.toHaveBeenCalled();
  });

  it("when disconnected, the manual write button gates to connect while Check (a read) stays available", () => {
    const onAbsorb = vi.fn(async () => ({}));
    const onCheck = vi.fn(async () => null);
    const onConnect = vi.fn();
    render(
      <LiquidateView accounts={[]} loading={false} onAbsorb={onAbsorb} onCheck={onCheck} connected={false} onConnect={onConnect} />,
    );
    // Check is a read — it stays usable while disconnected.
    expect(screen.getByRole("button", { name: /^check$/i })).toBeInTheDocument();
    // The write button is the connect gate; clicking it connects, never absorbs.
    const gateBtns = screen.getAllByRole("button", { name: /connect to absorb/i });
    expect(gateBtns.length).toBeGreaterThan(0);
    fireEvent.click(gateBtns[gateBtns.length - 1]);
    expect(onConnect).toHaveBeenCalled();
    expect(onAbsorb).not.toHaveBeenCalled();
  });

  it("when connected (default), the row Absorb runs the real onAbsorb (regression guard)", async () => {
    const onAbsorb = vi.fn(async () => ({}));
    render(<LiquidateView accounts={[ACC]} loading={false} onAbsorb={onAbsorb} />);
    const row = screen.getByText(/0x1111…1111/i).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: /^absorb$/i }));
    await waitFor(() => expect(onAbsorb).toHaveBeenCalledWith(ACC.address));
  });
});
