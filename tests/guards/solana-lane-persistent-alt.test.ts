import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ACTIVATE_STEPS } from "@/components/aerarium/lane/primitives";

// Guard for the per-user-ALT → persistent-ALT lane change: the Solana lane no
// longer creates a per-user Address Lookup Table at activation, so activation is
// a 2-step flow and the lane hooks must not pull in ensureAlt (the per-user ALT
// lifecycle). These assertions lock the change in so it can't silently regress.
const ROOT = process.cwd();
const LANE_HOOKS = [
  "lib/lane/useSolanaLane.ts",
  "lib/lane/useSolanaActions.ts",
];

describe("Solana lane drops the per-user ALT", () => {
  it("ACTIVATE_STEPS is a 2-step flow (no Register-ALT step)", () => {
    expect(ACTIVATE_STEPS).toHaveLength(2);
    const labels = ACTIVATE_STEPS.map((s) => s.label.toLowerCase());
    expect(labels.some((l) => l.includes("lookup table"))).toBe(false);
  });

  for (const rel of LANE_HOOKS) {
    it(`${rel} no longer imports ensureAlt`, () => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(/\bensureAlt\b/.test(src)).toBe(false);
      expect(/from ["']@\/lib\/solana\/alt["']/.test(src)).toBe(false);
    });
  }
});
