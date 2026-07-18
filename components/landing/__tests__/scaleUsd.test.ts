import { describe, it, expect } from "vitest";
import { scaleUsd, fmtCompact } from "../tokens";

describe("fmtCompact", () => {
  it("rounds small real values to 2dp (no raw float tail)", () => {
    expect(fmtCompact(6.09755046301197)).toBe("$6.10");
  });
  it("scales K and M", () => {
    expect(fmtCompact(350_400)).toBe("$350.4K");
    expect(fmtCompact(27_640_000)).toBe("$27.64M");
  });
});

describe("scaleUsd", () => {
  it("scales millions to M", () => {
    expect(scaleUsd(48_215_400)).toEqual({ value: 48.2154, suffix: "M", decimals: 2 });
  });
  it("scales thousands to K", () => {
    expect(scaleUsd(10_207)).toEqual({ value: 10.207, suffix: "K", decimals: 1 });
  });
  it("keeps small real values in plain dollars (the testnet case)", () => {
    expect(scaleUsd(6.0982)).toEqual({ value: 6.0982, suffix: "", decimals: 2 });
  });
  it("handles zero", () => {
    expect(scaleUsd(0)).toEqual({ value: 0, suffix: "", decimals: 2 });
  });
});
