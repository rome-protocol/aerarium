import { describe, it, expect, vi } from "vitest";

import generated from "../registry/generated.json";

// Capture the options passed to the wagmi/RainbowKit config builders by having
// the mocks echo their argument back. createWagmiConfig returns whatever the
// builder returns, so the test can inspect `.chains` / `.transports` directly
// without spinning up a real wagmi config (which would also hit WalletConnect).
vi.mock("@rainbow-me/rainbowkit", () => ({
  getDefaultConfig: (opts: unknown) => opts,
}));
vi.mock("wagmi", () => ({
  createConfig: (opts: unknown) => opts,
  http: () => () => null,
}));

describe("createWagmiConfig threads the runtime chainId", () => {
  it("registers the wagmi chain at the runtime chainId, not the build default", async () => {
    const { createWagmiConfig, WALLETCONNECT_PROJECT_ID_PLACEHOLDER } = await import("../wagmi");

    // The deployed bug: /api/env pins chain 200010 at runtime, but the wagmi
    // config baked the build-time default chain, so usePublicClient(200010)
    // returned undefined and every read silently no-op'd.
    // The mocked builders echo their opts back (which carry chains + transports);
    // the real createWagmiConfig return type is wagmi's Config (no public
    // `transports`), so cast through `unknown` to inspect the mocked runtime shape.
    const cfg200010 = createWagmiConfig(WALLETCONNECT_PROJECT_ID_PLACEHOLDER, 200010) as unknown as {
      chains: { id: number }[];
      transports: Record<number, unknown>;
    };
    expect(cfg200010.chains[0].id).toBe(200010);
    expect(cfg200010.transports[200010]).toBeDefined();

    // A different runtime chain must produce a different registration — proves
    // the chain id is actually threaded, not a coincidental build default.
    // The second chain is derived from the snapshot (any non-default chain)
    // rather than hardcoded, so a retired chain dropping out can't stale it.
    const { DEFAULT_CHAIN_CONFIG } = await import("../config");
    const otherId = Object.keys(generated as Record<string, unknown>)
      .map(Number)
      .find((id) => id !== DEFAULT_CHAIN_CONFIG.rome.chainId);
    expect(otherId).toBeDefined();
    const cfgOther = createWagmiConfig(WALLETCONNECT_PROJECT_ID_PLACEHOLDER, otherId) as {
      chains: { id: number }[];
    };
    expect(cfgOther.chains[0].id).toBe(otherId);
  });

  it("falls back to the build-default chain when chainId is omitted", async () => {
    const { createWagmiConfig, WALLETCONNECT_PROJECT_ID_PLACEHOLDER } = await import("../wagmi");
    const { DEFAULT_CHAIN_CONFIG } = await import("../config");
    const cfg = createWagmiConfig(WALLETCONNECT_PROJECT_ID_PLACEHOLDER) as {
      chains: { id: number }[];
    };
    expect(cfg.chains[0].id).toBe(DEFAULT_CHAIN_CONFIG.rome.chainId);
  });
});
