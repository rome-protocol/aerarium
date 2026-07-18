// @vitest-environment jsdom
//
// Landing nav app-entry button. The old "Connect" was misleading — it scrolled
// to the gate picker rather than connecting a wallet. Now: "Open app →" (→
// #gates) for a first-time visitor, and a direct "Resume {lane} →" fast path
// when a last-used lane is remembered (skips the picker for returning users).
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Nav } from "../Nav";
import { setLastLane } from "@/lib/lastLane";

describe("Nav app-entry", () => {
  beforeEach(() => localStorage.clear());

  it("shows 'Open app' → #gates for a first-time visitor (not the misleading 'Connect')", () => {
    render(<Nav />);
    expect(screen.getByRole("link", { name: /open app/i })).toHaveAttribute("href", "#gates");
    expect(screen.queryByRole("link", { name: /^connect$/i })).toBeNull();
  });

  it("offers a direct Resume link to the last-used lane (returning user)", async () => {
    setLastLane("evm");
    render(<Nav />);
    const resume = await screen.findByRole("link", { name: /resume.*ethereum/i });
    expect(resume).toHaveAttribute("href", "/evm");
  });

  it("resumes the Solana lane when that was last used", async () => {
    setLastLane("sol");
    render(<Nav />);
    const resume = await screen.findByRole("link", { name: /resume.*solana/i });
    expect(resume).toHaveAttribute("href", "/solana");
  });
});
