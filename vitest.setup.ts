import { expect, afterEach, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";

expect.extend(matchers);

// jsdom doesn't implement matchMedia; the theme toggle (and anything else
// that observes prefers-color-scheme) needs it to exist. Defaults to
// `matches: false` (no preference) so components stay deterministic.
// Individual tests can override per-test if they need to simulate the
// system being in dark mode.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: false,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  });
}

afterEach(() => {
  cleanup();
});
