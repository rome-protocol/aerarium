import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CompoundChainConfig } from "../registry/types";

// Mock the registry with the REAL network classifications (matching
// generated.json): 30001 is a RETIRED real-testnet substrate chain, 121302 +
// 200010 are live devnet chains. The previous mock wrongly tagged 200010
// 'testnet' — which HID the live bug: in reality no chain is 'testnet', so the
// fallback `find(network==='testnet') ?? chains[0]` silently selected
// chains[0] = the retired 30001, and the client defaulted to a dead chain.
vi.mock("../registry", () => ({
  listCompoundChains: () => [
    { chainId: 30001, network: "real-testnet", chainSlug: "aurelius" },
    { chainId: 121302, network: "devnet", chainSlug: "trajan" },
    { chainId: 200010, network: "devnet", chainSlug: "hadrian" },
  ],
  getCompoundConfig: (chainId: number): CompoundChainConfig => ({
    chainId,
    chainSlug: "mock",
    displayName: "Mock",
    network: chainId === 30001 ? "real-testnet" : "devnet",
    rpcUrl: "http://localhost:9090",
    explorerUrl: "https://via-mock.testnet.romeprotocol.xyz/",
    baseAsset: {
      address: "0x0000000000000000000000000000000000000001",
      displaySymbol: "USDC",
      underlyingMint: "mint",
    },
    comets: {
      "supply-only": { label: "supply-only", address: "0x0000000000000000000000000000000000000002", collateralAssets: [] },
    },
    primaryComet: "supply-only",
    bulker: "0x0000000000000000000000000000000000000003",
    collateralAssets: {},
    ux: { singleTxFlows: [], bundleFlows: [], fallbackFlows: [] },
    jitoEnabled: false,
    persistentAlts: [],
  }),
}));

describe("resolveDefaultChainId", () => {
  const ORIG_ENV = process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID;
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID;
    vi.resetModules();
  });
  afterEach(() => {
    if (ORIG_ENV !== undefined) process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID = ORIG_ENV;
    else delete process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID;
  });

  it("prefers explicit runtimeChainId over everything (priority 1)", async () => {
    const { resolveDefaultChainId } = await import("../config");
    expect(resolveDefaultChainId({ runtimeChainId: 200010 })).toBe(200010);
    expect(resolveDefaultChainId({ runtimeChainId: 30001 })).toBe(30001);
  });

  it("falls back to NEXT_PUBLIC_DEFAULT_CHAIN_ID env when no runtime override (priority 2)", async () => {
    process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID = "200010";
    const { resolveDefaultChainId } = await import("../config");
    expect(resolveDefaultChainId({ runtimeChainId: null })).toBe(200010);
  });

  it("registry fallback (no runtime, no env) NEVER selects a retired real-testnet chain like 30001", async () => {
    const { resolveDefaultChainId } = await import("../config");
    // Regression for the live incident: with the real network mix (no 'testnet'
    // chain), the old fallback returned chains[0] = 30001 (Aurelius, retired —
    // nothing deployed there), so the client queried a dead chain. The fallback
    // must pick a LIVE (devnet) chain instead.
    const got = resolveDefaultChainId({ runtimeChainId: null });
    expect(got).not.toBe(30001);
    expect([121302, 200010]).toContain(got);
  });
});

describe("DEFAULT_CHAIN_CONFIG.rome.baseSymbol", () => {
  it("exposes the base asset displaySymbol from the registry on the legacy config surface", async () => {
    const { DEFAULT_CHAIN_CONFIG } = await import("../config");
    expect(DEFAULT_CHAIN_CONFIG.rome.baseSymbol).toBe("USDC");
  });
});
