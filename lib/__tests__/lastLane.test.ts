// @vitest-environment jsdom
//
// lastLane persistence — the returning-user fast path. When a user enters a
// gate, we remember it; the landing then offers a direct "Resume {lane}" link
// instead of making repeat visitors re-run the gate picker. SSR-safe (no window
// → null) and validates the stored value (only "evm" | "sol").
import { describe, it, expect, beforeEach } from "vitest";
import { getLastLane, setLastLane } from "../lastLane";

describe("lastLane persistence", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing is stored", () => {
    expect(getLastLane()).toBeNull();
  });

  it("round-trips a lane side", () => {
    setLastLane("evm");
    expect(getLastLane()).toBe("evm");
    setLastLane("sol");
    expect(getLastLane()).toBe("sol");
  });

  it("ignores a corrupt stored value", () => {
    localStorage.setItem("aer:lastLane", "garbage");
    expect(getLastLane()).toBeNull();
  });
});
