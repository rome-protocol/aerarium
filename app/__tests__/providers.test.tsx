// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RootProviders } from "../providers";
import { EvmProviders } from "../providers-evm";
import { SolanaProviders } from "../providers-solana";

vi.mock("@/lib/wagmi", () => ({
  config: {} as any,
  createWagmiConfig: (_pid: string) => ({}) as any,
  isMockWallet: false,
  WALLETCONNECT_PROJECT_ID_PLACEHOLDER: "00000000000000000000000000000000",
}));

vi.mock("wagmi", async (orig) => {
  const real = await (orig() as Promise<typeof import("wagmi")>);
  return {
    ...real,
    WagmiProvider: ({ children }: any) => <div data-testid="wagmi">{children}</div>,
    useConnect: () => ({ connect: () => {}, connectors: [] }),
  };
});

vi.mock("@rainbow-me/rainbowkit", () => ({
  RainbowKitProvider: ({ children }: any) => <div data-testid="rk">{children}</div>,
}));

// Capture the endpoint passed to the Solana ConnectionProvider so we can assert
// the lane resolves the devnet RPC (real config wiring, not just a mounted mock).
let capturedEndpoint: string | undefined;
vi.mock("@solana/wallet-adapter-react", () => ({
  ConnectionProvider: ({ endpoint, children }: any) => {
    capturedEndpoint = endpoint;
    return <div data-testid="sol-conn">{children}</div>;
  },
  WalletProvider: ({ children }: any) => <div data-testid="sol-wallet">{children}</div>,
}));

vi.mock("@solana/wallet-adapter-react-ui", () => ({
  WalletModalProvider: ({ children }: any) => <div data-testid="sol-modal">{children}</div>,
}));

describe("RootProviders (wallet-agnostic)", () => {
  it("provides EnvProvider so useEnv() resolves", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ defaultChainId: 200010 }),
    } as Response);

    const { useEnv } = await import("@/lib/env-context");
    function Probe() {
      const env = useEnv();
      return <span data-testid="probe">{String(env.defaultChainId)}</span>;
    }
    render(
      <RootProviders>
        <Probe />
      </RootProviders>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe").textContent).toBe("200010"),
    );
  });

  it("mounts NO wallet providers (landing renders wallet-free)", () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ defaultChainId: 200010 }) } as Response);
    render(
      <RootProviders>
        <span data-testid="child">x</span>
      </RootProviders>,
    );
    expect(screen.getByTestId("child").textContent).toBe("x");
    expect(screen.queryByTestId("wagmi")).toBeNull();
    expect(screen.queryByTestId("rk")).toBeNull();
    expect(screen.queryByTestId("sol-conn")).toBeNull();
  });
});

describe("EvmProviders", () => {
  it("composes Wagmi + RainbowKit around children (under RootProviders' EnvProvider)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ defaultChainId: 200010, walletConnectProjectId: "" }),
    } as Response);
    render(
      <RootProviders>
        <EvmProviders>
          <span data-testid="evm-child">evm</span>
        </EvmProviders>
      </RootProviders>,
    );
    await waitFor(() => expect(screen.getByTestId("evm-child").textContent).toBe("evm"));
    expect(screen.getByTestId("wagmi")).toBeTruthy();
    expect(screen.getByTestId("rk")).toBeTruthy();
    // No Solana stack leaks into the EVM lane.
    expect(screen.queryByTestId("sol-conn")).toBeNull();
  });
});

describe("SolanaProviders", () => {
  it("composes the Solana wallet stack and points the connection at the same-origin /api/solana-rpc proxy", () => {
    render(
      <SolanaProviders>
        <span data-testid="sol-child">sol</span>
      </SolanaProviders>,
    );
    expect(screen.getByTestId("sol-child").textContent).toBe("sol");
    expect(screen.getByTestId("sol-conn")).toBeTruthy();
    expect(screen.getByTestId("sol-wallet")).toBeTruthy();
    expect(screen.getByTestId("sol-modal")).toBeTruthy();
    // No EVM stack leaks into the Solana lane.
    expect(screen.queryByTestId("wagmi")).toBeNull();
    // The DoTxUnsigned submits through the same-origin proxy — the private
    // SOLANA_RPC is resolved server-side and never appears in the client.
    expect(capturedEndpoint).toBe(`${window.location.origin}/api/solana-rpc`);
    expect(capturedEndpoint).not.toMatch(/api\.devnet\.solana\.com/);
  });
});
