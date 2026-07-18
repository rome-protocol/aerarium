// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageFooter } from "../PageFooter";

describe("PageFooter", () => {
  it("renders the 'Backed by Compound v3' trust line with the chain name", () => {
    render(<PageFooter chainName="Rome Hadrian" network="testnet" />);
    expect(screen.getByText(/Backed by Compound v3.+Rome Hadrian/i)).toBeInTheDocument();
  });

  it("includes the Rome network classification in the trust line", () => {
    render(<PageFooter chainName="Rome Hadrian" network="testnet" />);
    expect(screen.getByText(/testnet/i)).toBeInTheDocument();
  });

  it("renders a live-status indicator", () => {
    render(<PageFooter chainName="Rome Hadrian" network="testnet" />);
    expect(screen.getByLabelText(/Status:.+live/i)).toBeInTheDocument();
  });

  it("links GitHub to the demo repo and Docs to the the docs page (no '#' placeholders)", () => {
    render(<PageFooter chainName="Rome Hadrian" network="testnet" />);
    const gh = screen.getByRole("link", { name: /^GitHub/i });
    expect(gh.getAttribute("href")).toMatch(/^https:\/\/github\.com\//);
    const docs = screen.getByRole("link", { name: /^Docs/i });
    expect(docs.getAttribute("href")).toMatch(/^https:\/\//);
    // No leftover # placeholders anywhere.
    expect(document.querySelectorAll('a[href="#"]').length).toBe(0);
  });

  it("renders without crashing when chainName / network are missing (pre-config)", () => {
    render(<PageFooter />);
    expect(screen.getByText(/Backed by Compound v3/i)).toBeInTheDocument();
  });
});
