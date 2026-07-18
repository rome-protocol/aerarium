// @vitest-environment jsdom
//
// Footer must not ship dead-end links. The "Build" (Docs/GitHub/Audits/Bug
// bounty) and "Network" (Rome/Bridge status/Explorer) columns were all
// href="#" placeholders — visible dead-ends. With no real targets to wire,
// they're removed; the Protocol column (real in-page anchors) stays.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Footer } from "../Footer";

describe("Footer — no dead-end links", () => {
  it("renders no href='#' anchors", () => {
    const { container } = render(<Footer />);
    const dead = Array.from(container.querySelectorAll('a[href="#"]'));
    expect(dead).toHaveLength(0);
  });

  it("keeps the real Protocol section anchors", () => {
    const { container } = render(<Footer />);
    const markets = container.querySelector('a[href="#markets"]');
    expect(markets).not.toBeNull();
  });
});
