import { describe, it, expect } from "vitest";
import { isFlowsEnabled } from "../flowsGate";

describe("isFlowsEnabled", () => {
  it("is enabled outside production (dev harness page)", () => {
    expect(isFlowsEnabled({}, { production: false })).toBe(true);
  });

  it("is disabled in production by default", () => {
    expect(isFlowsEnabled({}, { production: true })).toBe(false);
  });

  it("can be force-enabled in production via NEXT_PUBLIC_ENABLE_FLOWS=1", () => {
    expect(isFlowsEnabled({ NEXT_PUBLIC_ENABLE_FLOWS: "1" }, { production: true })).toBe(true);
  });
});
