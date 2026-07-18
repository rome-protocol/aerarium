// @vitest-environment jsdom
//
// LaneHeader exposes an explicit "Manage" nav link to the lane home (the action
// surface) — so from the dashboard / liquidate / faucet sub-pages there's a
// labeled way back to act (the gate chip navigates there too, but reads as a
// lane indicator, not a destination). Like the Dashboard link, it's plain text
// (not a link) when you're already on the lane home.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LaneHeader } from "../LaneHeader";

let pathname = "/evm/dashboard";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("LaneHeader — Manage link to the action surface", () => {
  it("links 'Manage' to the EVM lane home when on a sub-page", () => {
    pathname = "/evm/dashboard";
    render(<LaneHeader chain="evm" account={null} onDisconnect={() => {}} />);
    expect(screen.getByRole("link", { name: /^manage$/i })).toHaveAttribute("href", "/evm");
  });

  it("renders 'Manage' as plain text (not a link) when already on the lane home", () => {
    pathname = "/evm";
    render(<LaneHeader chain="evm" account={null} onDisconnect={() => {}} />);
    expect(screen.queryByRole("link", { name: /^manage$/i })).toBeNull();
    expect(screen.getByText(/^manage$/i)).toBeInTheDocument();
  });

  it("links 'Manage' to the Solana lane home on the solana side", () => {
    pathname = "/solana/liquidate";
    render(<LaneHeader chain="sol" account={null} onDisconnect={() => {}} />);
    expect(screen.getByRole("link", { name: /^manage$/i })).toHaveAttribute("href", "/solana");
  });
});

describe("LaneHeader — gate switcher (no redundant Markets link)", () => {
  it("does NOT render a 'Markets' nav link — the wordmark already routes to the landing market overview", () => {
    pathname = "/evm";
    render(<LaneHeader chain="evm" account={null} onDisconnect={() => {}} />);
    expect(screen.queryByRole("link", { name: /^markets$/i })).toBeNull();
    // the wordmark (href="/") is the route to the market overview, so the lane
    // top bar doesn't duplicate it
    expect(screen.getAllByRole("link").some((l) => l.getAttribute("href") === "/")).toBe(true);
  });

  it("offers a gate switch to the Solana lane from the EVM lane", () => {
    pathname = "/evm";
    render(<LaneHeader chain="evm" account={null} onDisconnect={() => {}} />);
    expect(screen.getByRole("link", { name: /switch to solana/i })).toHaveAttribute("href", "/solana");
  });

  it("offers a gate switch to the Ethereum lane from the Solana lane", () => {
    pathname = "/solana/liquidate";
    render(<LaneHeader chain="sol" account={null} onDisconnect={() => {}} />);
    expect(screen.getByRole("link", { name: /switch to ethereum/i })).toHaveAttribute("href", "/evm");
  });
});
