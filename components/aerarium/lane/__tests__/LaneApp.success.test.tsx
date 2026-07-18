// @vitest-environment jsdom
//
// Integration test for the P3 success confirmation + optimistic activity, driven
// through the REAL mock adapter (useMockLane) — its submitAction simulates a
// successful action via timers, which is exactly the "mock supply → success"
// path the live /evm route can't exercise headlessly (that route runs the real
// wagmi adapter). Asserts: after a (mock) supply confirms, LaneApp shows the
// green success banner AND a "just now" row appears in Recent activity. Also
// asserts the gate chip is a link to the lane home.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { LaneApp } from "../LaneApp";
import { useMockLane } from "../useMockLane";

// next/link renders a plain <a> in jsdom; keep it trivial + deterministic.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

function MockLaneApp({ chain }: { chain: "evm" | "sol" }) {
  const adapter = useMockLane(chain);
  return <LaneApp adapter={adapter} />;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); });

describe("LaneApp — mock EVM success banner + optimistic activity", () => {
  it("after a mock supply confirms, shows the success banner + a 'just now' activity row", async () => {
    render(<MockLaneApp chain="evm" />);

    // The mock connect resolves after 1100ms.
    const connectBtn = screen.getByRole("button", { name: /metamask/i });
    act(() => { connectBtn.click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });

    // Empty position screen → ActionPanel for the first asset (USDC). Enter an
    // amount and submit the action (the panel's submit CTA reads "Supply …").
    const amountInput = screen.getByRole("textbox");
    act(() => {
      // RTL fireEvent-less: set value + dispatch input so the controlled field updates.
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(amountInput, "100");
      amountInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const supplyBtn = screen.getByRole("button", { name: /^supply 100 usdc$/i });
    act(() => { supplyBtn.click(); });

    // Drive the mock signing recipe (EVM supply now models approve + supply, so
    // up to 3 steps × 950ms) + the 600ms success tail. Advance generously so the
    // success timeout fires regardless of the exact step count.
    await act(async () => { await vi.advanceTimersByTimeAsync(950 * 4 + 700); });

    // Success banner: a dismissable row with "Supplied" + "$100.00" + a dismiss
    // button (aria-label="Dismiss"). Scope to that row so we don't collide with
    // the ActionPanel label or the activity rows.
    const dismiss = screen.getByRole("button", { name: /dismiss/i });
    const banner = dismiss.closest("div")!;
    expect(within(banner).getByText("Supplied")).toBeInTheDocument();
    expect(within(banner).getByText(/\$100\.00/)).toBeInTheDocument();

    // Recent-activity has a "just now" row for the same action (unique label).
    expect(screen.getByText("just now")).toBeInTheDocument();
  });
});

describe("LaneApp — gate chip links to lane home", () => {
  it("EVM lane gate chip is a link to /evm", () => {
    render(<MockLaneApp chain="evm" />);
    // The LaneIndicator chip is the <a> whose text is "Ethereum Gate" (glyph svg
    // sits between the two text nodes, so match on the link's full textContent).
    const gate = screen
      .getAllByRole("link")
      .find((a) => /ethereum\s+gate/i.test(a.textContent ?? ""));
    expect(gate).toBeTruthy();
    expect(gate!.getAttribute("href")).toBe("/evm");
  });
});
