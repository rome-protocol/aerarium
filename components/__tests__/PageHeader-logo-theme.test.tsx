// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "../PageHeader";

// usePathname required by PageHeader for active-nav highlighting.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: {
    Custom: ({ children }: { children: (s: unknown) => React.ReactNode }) =>
      children({
        account: undefined,
        chain: undefined,
        mounted: true,
        openConnectModal: () => {},
        openAccountModal: () => {},
        openChainModal: () => {},
      }),
  },
}));

describe("PageHeader logo theme swap", () => {
  // jsdom polyfill for matchMedia so useTheme doesn't crash in useEffect.
  const matchMediaStub = (matches: boolean) => ({
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });

  it("uses the WHITE logo variant when the effective theme is dark (renders against dark canvas)", () => {
    window.matchMedia = vi.fn().mockImplementation(() => matchMediaStub(true));
    // Persisted preference 'dark' so the effective theme resolves to dark
    // before the matchMedia listener fires.
    localStorage.setItem(
      "rome-compound-theme",
      JSON.stringify({ state: { preference: "dark" }, version: 0 }),
    );
    const { container } = render(<PageHeader riskRatio={null} chainName="Rome Hadrian" />);
    const logomark = container.querySelector('img[src*="logomark"]');
    expect(logomark?.getAttribute("src")).toMatch(/logomark-tight-white\.svg/);
    const wordmark = container.querySelector('img[src*="wordmark"]');
    expect(wordmark?.getAttribute("src")).toMatch(/wordmark-tight-white\.svg/);
  });

  it("uses the DARK / purple logo variant when the effective theme is light (against cream canvas)", () => {
    window.matchMedia = vi.fn().mockImplementation(() => matchMediaStub(false));
    localStorage.setItem(
      "rome-compound-theme",
      JSON.stringify({ state: { preference: "light" }, version: 0 }),
    );
    const { container } = render(<PageHeader riskRatio={null} chainName="Rome Hadrian" />);
    const logomark = container.querySelector('img[src*="logomark"]');
    // Light variant uses logomark-tight.svg (no -white suffix)
    expect(logomark?.getAttribute("src")).toMatch(/logomark-tight\.svg/);
    expect(logomark?.getAttribute("src")).not.toMatch(/logomark-tight-white\.svg/);
    const wordmark = container.querySelector('img[src*="wordmark"]');
    expect(wordmark?.getAttribute("src")).toMatch(/wordmark-tight\.svg/);
    expect(wordmark?.getAttribute("src")).not.toMatch(/wordmark-tight-white\.svg/);
  });
});
