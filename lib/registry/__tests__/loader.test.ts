import { describe, it, expect } from "vitest";
import {
  buildCompoundChainConfig,
  buildCompoundChainConfigMap,
  resolveRpcRef,
} from "../loader";
import type { CompoundDeployment } from "../types";

function hadrianEntry(overrides: Partial<CompoundDeployment> = {}): CompoundDeployment {
  return {
    schemaVersion: "1",
    chainId: 200010,
    chainSlug: "hadrian",
    compoundVersion: "v3-0.16.0",
    baseAsset: {
      type: "wrapper",
      address: "0xc1418f71Fdd16F8010382da1F796C2C90c6508b0",
      underlyingMint: "3b442cb3912157f13a933d0134282d032b5ffecd01a2dbf1b7790608df002ea7",
      displaySymbol: "wUSDC",
      sourceRef: "rome-solidity@b662123",
    },
    comets: [
      {
        label: "supply-only",
        address: "0xBD0707F03B51fE2eB94519D319fEe2DbA02DB135",
        extensionDelegate: "0x0448b1c8d4bD6259588B5B936AE09DA180aC03a0",
        implementation: "0xE45E740053f1E245303f36dEDd3fCA65D64bA8Cb",
        proxyAdmin: "0x36aB36d5E48fDd3440b1C2EbEa360F3b76d0B2EF",
        collateralAssets: [],
      },
      {
        label: "collat-pcol",
        address: "0x10731DF2488ed1f7aA4D39E04235358C99C7c9F0",
        extensionDelegate: "0xc922a24e997fed92E912280292cef1d865058Ae0",
        implementation: "0x7B8774d2A64F112a320bB00349E19255Ae3aC590",
        proxyAdmin: "0x36aB36d5E48fDd3440b1C2EbEa360F3b76d0B2EF",
        collateralAssets: ["0x113A5f117D6E5324921d0434ade49a0659B67795"],
      },
    ],
    bulker: "0xD896ECe11fBAE90255c8010e4c5c5BD6DBb4A874",
    collateralAssets: [
      {
        symbol: "PCOL",
        address: "0x113A5f117D6E5324921d0434ade49a0659B67795",
        priceFeed: "0x5C4B14eE8e9533f8e34B2fa0D533F4942d6b5633",
        priceFeedKind: "simple",
        decimals: 18,
      },
    ],
    baseTokenPriceFeed: "0x061434caB7F8e6F7E396231Ae9b277a5e14c6254",
    baseTokenPriceFeedKind: "simple",
    jito: { enabled: false, reason: "Hadrian on Solana devnet; no Block Engine" },
    ux: { singleTxFlows: ["supply", "withdraw"], bundleFlows: [], fallbackFlows: ["sequentialNTx"] },
    demoUrl: "https://compound.testnet.romeprotocol.xyz",
    rpcRef: "chains/200010-hadrian/chain.json#rpcUrl",
    deployedAt: "2026-05-17T09:11:00Z",
    sourceCommits: { comet: "compound-on-rome-comet@1b22af2c" },
    status: "draft",
    ...overrides,
  };
}

const HADRIAN_CHAIN_JSON = {
  chainId: 200010,
  name: "Rome Hadrian",
  network: "testnet",
  rpcUrl: "https://hadrian.testnet.romeprotocol.xyz/",
  status: "live",
};

describe("resolveRpcRef", () => {
  it("resolves a well-formed rpcRef to the chain.json field", () => {
    const url = resolveRpcRef("chains/200010-hadrian/chain.json#rpcUrl", HADRIAN_CHAIN_JSON);
    expect(url).toBe("https://hadrian.testnet.romeprotocol.xyz/");
  });

  it("throws on unsupported shape", () => {
    expect(() => resolveRpcRef("https://hardcoded.example.com/", HADRIAN_CHAIN_JSON)).toThrow(/Unsupported rpcRef/);
    expect(() => resolveRpcRef("chains/200010/chain.json#rpcUrl", HADRIAN_CHAIN_JSON)).toThrow(/Unsupported rpcRef/);
  });

  it("throws if referenced field doesn't exist or isn't a string", () => {
    expect(() => resolveRpcRef("chains/200010-hadrian/chain.json#missing", HADRIAN_CHAIN_JSON)).toThrow(/resolved to non-string/);
    expect(() => resolveRpcRef("chains/200010-hadrian/chain.json#chainId", HADRIAN_CHAIN_JSON)).toThrow(/resolved to non-string/);
  });
});

describe("buildCompoundChainConfig", () => {
  it("builds a normalized config from a registry entry + chain.json", () => {
    const cfg = buildCompoundChainConfig(hadrianEntry(), HADRIAN_CHAIN_JSON);
    expect(cfg.chainId).toBe(200010);
    expect(cfg.chainSlug).toBe("hadrian");
    expect(cfg.displayName).toBe("Rome Hadrian");
    expect(cfg.rpcUrl).toBe("https://hadrian.testnet.romeprotocol.xyz/");
    expect(cfg.baseAsset.address).toBe("0xc1418f71Fdd16F8010382da1F796C2C90c6508b0");
    expect(cfg.baseAsset.displaySymbol).toBe("wUSDC");
    expect(Object.keys(cfg.comets).sort()).toEqual(["collat-pcol", "supply-only"]);
    expect(cfg.primaryComet).toBe("supply-only");
    expect(cfg.bulker).toBe("0xD896ECe11fBAE90255c8010e4c5c5BD6DBb4A874");
    expect(cfg.collateralAssets.PCOL).toBeDefined();
    expect(cfg.collateralAssets.PCOL.decimals).toBe(18);
    expect(cfg.jitoEnabled).toBe(false);
    expect(cfg.ux.singleTxFlows).toContain("supply");
  });

  it("reads explorerUrl from chain.json (rome-via base, not the RPC URL)", () => {
    const cfg = buildCompoundChainConfig(hadrianEntry(), {
      ...HADRIAN_CHAIN_JSON,
      explorerUrl: "https://via-hadrian.testnet.romeprotocol.xyz/",
    });
    expect(cfg.explorerUrl).toBe("https://via-hadrian.testnet.romeprotocol.xyz/");
    // Critically NOT the RPC URL — that was the bug.
    expect(cfg.explorerUrl).not.toBe(cfg.rpcUrl);
  });

  it("falls back to rpcUrl when chain.json omits explorerUrl (defensive)", () => {
    const cfg = buildCompoundChainConfig(hadrianEntry(), HADRIAN_CHAIN_JSON);
    expect(cfg.explorerUrl).toBe(cfg.rpcUrl);
  });

  it("picks first comet as primary when no supply-only label exists", () => {
    const entry = hadrianEntry({
      comets: [
        {
          label: "collat-pcol",
          address: "0x10731DF2488ed1f7aA4D39E04235358C99C7c9F0",
          extensionDelegate: "0xc922a24e997fed92E912280292cef1d865058Ae0",
          implementation: "0x7B8774d2A64F112a320bB00349E19255Ae3aC590",
          proxyAdmin: "0x36aB36d5E48fDd3440b1C2EbEa360F3b76d0B2EF",
          collateralAssets: ["0x113A5f117D6E5324921d0434ade49a0659B67795"],
        },
      ],
    });
    const cfg = buildCompoundChainConfig(entry, HADRIAN_CHAIN_JSON);
    expect(cfg.primaryComet).toBe("collat-pcol");
  });

  it("refuses to surface retired deployments", () => {
    const retired = hadrianEntry({ status: "retired" });
    expect(() => buildCompoundChainConfig(retired, HADRIAN_CHAIN_JSON)).toThrow(/retired/);
  });

  it("throws on missing comets[]", () => {
    const empty = hadrianEntry({ comets: [] });
    expect(() => buildCompoundChainConfig(empty, HADRIAN_CHAIN_JSON)).toThrow(/no comets/);
  });
});

describe("buildCompoundChainConfigMap", () => {
  it("keys by chainId, skips retired, throws on duplicates", () => {
    const inputs = [
      { entry: hadrianEntry(), chainJson: HADRIAN_CHAIN_JSON },
    ];
    const map = buildCompoundChainConfigMap(inputs);
    expect(map[200010]).toBeDefined();
    expect(map[200010].chainId).toBe(200010);
  });

  it("skips retired entries silently", () => {
    const inputs = [
      { entry: hadrianEntry({ status: "retired" }), chainJson: HADRIAN_CHAIN_JSON },
    ];
    const map = buildCompoundChainConfigMap(inputs);
    expect(map[200010]).toBeUndefined();
  });

  it("throws on duplicate chainIds across entries", () => {
    const inputs = [
      { entry: hadrianEntry(), chainJson: HADRIAN_CHAIN_JSON },
      { entry: hadrianEntry(), chainJson: HADRIAN_CHAIN_JSON },
    ];
    expect(() => buildCompoundChainConfigMap(inputs)).toThrow(/Duplicate chainId/);
  });
});
