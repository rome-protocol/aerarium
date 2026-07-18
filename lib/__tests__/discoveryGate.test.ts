import { describe, it, expect } from "vitest";
import { isDiscoveryEnabled } from "../discoveryGate";

describe("isDiscoveryEnabled", () => {
  it("is enabled outside production (dev probe page)", () => {
    expect(isDiscoveryEnabled({}, { production: false })).toBe(true);
  });

  it("is disabled in production by default", () => {
    expect(isDiscoveryEnabled({}, { production: true })).toBe(false);
  });

  it("can be force-enabled in production via NEXT_PUBLIC_ENABLE_DISCOVERY=1", () => {
    expect(isDiscoveryEnabled({ NEXT_PUBLIC_ENABLE_DISCOVERY: "1" }, { production: true })).toBe(
      true,
    );
  });
});
