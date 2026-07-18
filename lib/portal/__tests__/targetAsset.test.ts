import { describe, it, expect } from "vitest";
import { targetForAddress } from "../targetAsset";

const baseAsset = "0xff1ADc858a6e16AD146B020Da1Cbfa5891A76F97";
const symbolByAsset = {
  [baseAsset.toLowerCase()]: "wUSDC",
  "0xcc000000000000000000000000000000000000cc": "wETH",
  "0xee000000000000000000000000000000000000ee": "wSOL",
};
const decimalsByAsset = {
  [baseAsset.toLowerCase()]: 6,
  "0xcc000000000000000000000000000000000000cc": 18,
  "0xee000000000000000000000000000000000000ee": 9,
};

describe("targetForAddress", () => {
  it("returns null when the address IS the base asset (back-compat: account-card path)", () => {
    expect(
      targetForAddress(baseAsset, baseAsset, symbolByAsset, decimalsByAsset),
    ).toBeNull();
  });

  it("returns null when the address is the base asset with different casing", () => {
    expect(
      targetForAddress(
        baseAsset.toUpperCase(),
        baseAsset.toLowerCase(),
        symbolByAsset,
        decimalsByAsset,
      ),
    ).toBeNull();
  });

  it("returns symbol/address/decimals for a known collat row", () => {
    expect(
      targetForAddress(
        "0xcc000000000000000000000000000000000000cc",
        baseAsset,
        symbolByAsset,
        decimalsByAsset,
      ),
    ).toEqual({
      symbol: "wETH",
      address: "0xcc000000000000000000000000000000000000cc",
      decimals: 18,
    });
  });

  it("matches case-insensitively (collat addr passed with uppercase)", () => {
    expect(
      targetForAddress(
        "0xCC000000000000000000000000000000000000CC",
        baseAsset,
        symbolByAsset,
        decimalsByAsset,
      ),
    ).toEqual({
      symbol: "wETH",
      address: "0xCC000000000000000000000000000000000000CC",
      decimals: 18,
    });
  });

  it("returns null when the address is unknown (defensive: stale market data)", () => {
    expect(
      targetForAddress(
        "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        baseAsset,
        symbolByAsset,
        decimalsByAsset,
      ),
    ).toBeNull();
  });
});
