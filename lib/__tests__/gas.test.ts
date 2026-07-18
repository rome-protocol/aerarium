import { describe, it, expect } from "vitest";
import { buffered, GAS_BUFFER_NUM, GAS_BUFFER_DEN } from "../gas";

describe("gas buffer", () => {
  it("applies the documented 1.3× buffer to an estimate", () => {
    expect(buffered(100n)).toBe(130n);
    expect(buffered(1_000_000n)).toBe(1_300_000n);
  });

  it("ratio constants are 13/10 (matches the Rome web app useTopUpUserPda + Aave-demo faucet)", () => {
    expect(GAS_BUFFER_NUM).toBe(13n);
    expect(GAS_BUFFER_DEN).toBe(10n);
  });

  it("integer-divides — small values floor correctly", () => {
    // 5 * 13 / 10 = 65 / 10 = 6 (integer division)
    expect(buffered(5n)).toBe(6n);
    expect(buffered(0n)).toBe(0n);
  });
});
