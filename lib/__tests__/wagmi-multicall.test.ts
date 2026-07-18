import { describe, it, expect, vi } from "vitest";

// Mock the wallet libs so importing ../wagmi doesn't pull a live config; we
// only exercise chainFor (pure: registry config → viem chain).
vi.mock("@rainbow-me/rainbowkit", () => ({
  getDefaultConfig: () => ({ chains: [], transports: {} }),
}));
vi.mock("wagmi", () => ({
  createConfig: () => ({} as unknown),
  http: () => () => null,
}));

describe("wagmi chainFor — per-chain multicall3", () => {
  it("registers the chain's own multicall3 so viem auto-batches reads", async () => {
    const { chainFor } = await import("../wagmi");
    const hadrian = chainFor(200010); // Hadrian has a registry Multicall3
    expect(hadrian.contracts?.multicall3?.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("omits multicall3 for a chain whose registry config declares none (no cross-chain fallback address)", async () => {
    // No live registry chain lacks a Multicall3 today, so inject a config that
    // omits it and assert chainFor drops the contract — viem then has no (wrong)
    // cross-chain fallback address. Exercises the `rome.multicall3 ? … : undefined`
    // branch independent of which chains are in the snapshot.
    vi.resetModules();
    vi.doMock("../config", async () => {
      const actual = await vi.importActual<typeof import("../config")>("../config");
      return {
        ...actual,
        configForChain: () => ({
          rome: {
            chainId: 999001,
            name: "No-Multicall Test Chain",
            rpc: "https://example.invalid",
            multicall3: undefined,
          },
        }),
      };
    });
    const { chainFor } = await import("../wagmi");
    const noMulticall = chainFor(999001);
    expect(noMulticall.contracts?.multicall3).toBeUndefined();
    vi.doUnmock("../config");
  });
});
