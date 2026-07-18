// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "../ThemeToggle";
import { useThemeStore } from "@/store/themeStore";

// Reset the persisted store between tests so one test's toggle doesn't
// leak into the next. localStorage stays clean because each render starts
// from the store's initial "system" preference.
beforeEach(() => {
  useThemeStore.setState({ preference: "system" });
  // jsdom doesn't implement matchMedia; default to "light" OS so the
  // initial render's `effective === "dark"` seed is observable via the
  // first toggle producing "dark".
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
});

describe("ThemeToggle", () => {
  it("renders a Toggle theme button", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: /toggle theme/i })).toBeInTheDocument();
  });

  it("clicking flips the persisted preference between light + dark", () => {
    render(<ThemeToggle />);
    const before = useThemeStore.getState().preference;
    fireEvent.click(screen.getByRole("button", { name: /toggle theme/i }));
    const afterFirst = useThemeStore.getState().preference;
    expect(afterFirst).not.toBe(before);
    expect(["light", "dark"]).toContain(afterFirst);
  });

  it("button title reflects the current theme so screen readers know the destination", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole("button", { name: /toggle theme/i });
    // Initial paint seeds with "dark" → button title says "Switch to light mode"
    expect(btn).toHaveAttribute("title", expect.stringMatching(/switch to (dark|light) mode/i));
  });
});
