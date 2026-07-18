// @vitest-environment jsdom
//
// Regression for the runtime-chain bug (#66) IN OUR SPLIT providers. main's #66
// fixed the OLD combined app/providers.tsx, but we'd already forked the wagmi
// stack into app/providers-evm.tsx, which still built the config from the
// projectId ALONE — so usePublicClient({ chainId: 200010 }) returned undefined
// and every EVM-lane read silently no-op'd against the build-default chain.
// EvmProviders must thread the runtime defaultChainId (from /api/env via useEnv)
// into createWagmiConfig, exactly like #66 did for the combined file.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const h = vi.hoisted(() => ({
  createWagmiConfig: vi.fn(() => ({ mock: "config" })),
  env: { walletConnectProjectId: "pid", defaultChainId: 200010 as number | null, ready: true },
}));

vi.mock("@/lib/wagmi", () => ({ config: { mock: "boot" }, createWagmiConfig: h.createWagmiConfig, isMockWallet: false }));
vi.mock("@/lib/env-context", () => ({ useEnv: () => h.env }));
vi.mock("wagmi", () => ({
  WagmiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useConnect: () => ({ connect: vi.fn(), connectors: [] }),
}));
vi.mock("@rainbow-me/rainbowkit", () => ({
  RainbowKitProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { EvmProviders } from "../providers-evm";

describe("EvmProviders — threads the runtime chainId into the wagmi config (#66 in our split)", () => {
  beforeEach(() => h.createWagmiConfig.mockClear());

  it("builds the wagmi config at the runtime chainId, not the projectId alone", () => {
    h.env = { walletConnectProjectId: "pid", defaultChainId: 200010, ready: true };
    render(<EvmProviders><div /></EvmProviders>);
    expect(h.createWagmiConfig).toHaveBeenCalledWith("pid", 200010);
  });

  it("a different runtime chain produces a config at that chain", () => {
    h.env = { walletConnectProjectId: "pid", defaultChainId: 30001, ready: true };
    render(<EvmProviders><div /></EvmProviders>);
    expect(h.createWagmiConfig).toHaveBeenCalledWith("pid", 30001);
  });
});
