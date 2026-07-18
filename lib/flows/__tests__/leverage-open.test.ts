// Failing test for the leverage-open flow.
//
// Contract: given a registry-loaded CompoundChainConfig that supports
// supplyCollatBorrowBase in its ux.singleTxFlows, the demo can build a
// Bulker.invoke([SUPPLY_ASSET, WITHDRAW_ASSET]) calldata payload that
// supplies collateral and borrows base in ONE EVM tx.
//
// This test fails today because lib/flows/leverage-open.ts doesn't exist.

import { describe, it, expect } from "vitest";
import {
  buildLeverageOpenCalldata,
  isLeverageOpenSupported,
  type LeverageOpenInput,
} from "../leverage-open";
import type { CompoundChainConfig } from "../../registry/types";

function hadrianConfig(overrides: Partial<CompoundChainConfig> = {}): CompoundChainConfig {
  return {
    chainId: 200010,
    chainSlug: "hadrian",
    displayName: "Rome Hadrian",
    network: "testnet",
    rpcUrl: "https://hadrian.testnet.romeprotocol.xyz/",
    explorerUrl: "https://via-hadrian.testnet.romeprotocol.xyz/",
    baseAsset: {
      address: "0xc1418f71Fdd16F8010382da1F796C2C90c6508b0",
      displaySymbol: "wUSDC",
      underlyingMint: "3b442cb3912157f13a933d0134282d032b5ffecd01a2dbf1b7790608df002ea7",
    },
    comets: {
      "supply-only": {
        label: "supply-only",
        address: "0xBD0707F03B51fE2eB94519D319fEe2DbA02DB135",
        collateralAssets: [],
      },
      "collat-pcol": {
        label: "collat-pcol",
        address: "0x10731DF2488ed1f7aA4D39E04235358C99C7c9F0",
        collateralAssets: ["0x113A5f117D6E5324921d0434ade49a0659B67795"],
      },
    },
    primaryComet: "supply-only",
    bulker: "0xD896ECe11fBAE90255c8010e4c5c5BD6DBb4A874",
    collateralAssets: {
      PCOL: {
        symbol: "PCOL",
        address: "0x113A5f117D6E5324921d0434ade49a0659B67795",
        decimals: 18,
      },
    },
    ux: {
      singleTxFlows: [
        "supply",
        "supplyTo",
        "withdraw",
        "withdrawTo",
        "borrow",
        "transferAsset",
        "allow",
        "supplyCollatBorrowBase",
        "twoCollatSupply",
      ],
      bundleFlows: [],
      fallbackFlows: ["sequentialNTx"],
    },
    jitoEnabled: false,
    persistentAlts: [],
    ...overrides,
  };
}

describe("isLeverageOpenSupported", () => {
  it("returns true when supplyCollatBorrowBase is in ux.singleTxFlows AND a collat-aware Comet exists", () => {
    expect(isLeverageOpenSupported(hadrianConfig())).toBe(true);
  });

  it("returns false when supplyCollatBorrowBase is not in singleTxFlows (vanilla-only chain)", () => {
    const cfg = hadrianConfig({
      ux: {
        singleTxFlows: ["supply", "withdraw"],
        bundleFlows: [],
        fallbackFlows: ["sequentialNTx"],
      },
    });
    expect(isLeverageOpenSupported(cfg)).toBe(false);
  });

  it("returns false when no collat-aware Comet exists in the registry entry", () => {
    const cfg = hadrianConfig({
      comets: {
        "supply-only": {
          label: "supply-only",
          address: "0xBD0707F03B51fE2eB94519D319fEe2DbA02DB135",
          collateralAssets: [],
        },
      },
    });
    expect(isLeverageOpenSupported(cfg)).toBe(false);
  });
});

describe("buildLeverageOpenCalldata", () => {
  const input: LeverageOpenInput = {
    user: "0x6ba69E148C7ab4cb1d2A833De3B7f4B2889cB7Ad",
    collatSymbol: "PCOL",
    collatAmount: BigInt(10) ** BigInt(18), // 1 PCOL
    baseAmount: BigInt(10_000), // 10K raw wUSDC
  };

  it("returns a Bulker.invoke target + calldata + value tuple", () => {
    const result = buildLeverageOpenCalldata(hadrianConfig(), input);
    expect(result.target.toLowerCase()).toBe(
      "0xD896ECe11fBAE90255c8010e4c5c5BD6DBb4A874".toLowerCase(),
    );
    expect(result.value).toBe(BigInt(0));
    expect(result.calldata).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(result.calldata.length).toBeGreaterThan(2 + 8); // at least selector
  });

  it("calldata encodes two actions: SUPPLY_ASSET + WITHDRAW_ASSET", () => {
    const result = buildLeverageOpenCalldata(hadrianConfig(), input);
    // Bulker.invoke selector = keccak256("invoke(bytes32[],bytes[])")[0:4]
    expect(result.calldata.slice(0, 10)).toBe("0x555029a6");
    // Two actions => actions[] length encoded at the right offset
    expect(result.callbackInfo.actionCount).toBe(2);
    expect(result.callbackInfo.actions).toEqual(["SUPPLY_ASSET", "WITHDRAW_ASSET"]);
  });

  it("targets the collat-aware Comet (not the supply-only Comet)", () => {
    const result = buildLeverageOpenCalldata(hadrianConfig(), input);
    expect(result.callbackInfo.cometUsed.toLowerCase()).toBe(
      "0x10731DF2488ed1f7aA4D39E04235358C99C7c9F0".toLowerCase(),
    );
  });

  it("throws when collat symbol isn't registered in the registry", () => {
    expect(() =>
      buildLeverageOpenCalldata(hadrianConfig(), { ...input, collatSymbol: "UNKNOWN" }),
    ).toThrow(/UNKNOWN/);
  });

  it("throws when the chain doesn't support this flow", () => {
    const cfg = hadrianConfig({
      ux: {
        singleTxFlows: ["supply"],
        bundleFlows: [],
        fallbackFlows: ["sequentialNTx"],
      },
    });
    expect(() => buildLeverageOpenCalldata(cfg, input)).toThrow(/supplyCollatBorrowBase/);
  });
});
