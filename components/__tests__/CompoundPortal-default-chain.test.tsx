// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { EnvProvider } from "@/lib/env-context";
import { CompoundPortal } from "../CompoundPortal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// CompoundPortal → useReserveStats → useMarket(useQuery) needs a QueryClient
// ancestor (RootProviders provides it in the real app). retry:false so a failed
// /api/market fetch in this test settles immediately (→ reserves null, which the
// portal renders fine — these tests assert the chain name, not reserve values).
function renderPortal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EnvProvider>
        <CompoundPortal />
      </EnvProvider>
    </QueryClientProvider>,
  );
}

// wagmi lib config — stub out so module-level defineChain/getDefaultConfig don't run.
vi.mock("@/lib/wagmi", () => ({
  defaultChain: { id: 200010, name: "Rome Hadrian" },
  config: {} as any,
  isMockWallet: false,
}));

// Wagmi: render-tree shims so CompoundPortal can mount without a real wagmi config.
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
  useDisconnect: () => ({ disconnect: () => {} }),
  usePublicClient: () => null,
  useChainId: () => undefined,
  useSwitchChain: () => ({ switchChainAsync: async () => {} }),
  useWalletClient: () => ({ data: undefined }),
}));

// Rainbowkit ConnectButton.Custom + getDefaultConfig stub.
vi.mock("@rainbow-me/rainbowkit", () => {
  const Custom = ({ children }: { children: (s: unknown) => React.ReactNode }) =>
    children({
      account: undefined,
      chain: undefined,
      mounted: true,
      openConnectModal: () => {},
      openAccountModal: () => {},
      openChainModal: () => {},
    });
  const ConnectButton: unknown = () => <button>Connect Wallet</button>;
  (ConnectButton as { Custom: typeof Custom }).Custom = Custom;
  return { ConnectButton, getDefaultConfig: () => ({ chains: [], transports: {} }) };
});

describe("CompoundPortal default chain via useEnv", () => {
  it("renders the registry's default-chain name (Hadrian) once EnvProvider resolves", async () => {
    // Route by URL: /api/env and (now) useReserveStats→useMarket's /api/market
    // can fire in either order, so answer both rather than a single Once.
    global.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/env")) return { ok: true, json: async () => ({ defaultChainId: 200010 }) } as Response;
      return { ok: true, text: async () => "{}", json: async () => ({}) } as Response;
    }) as typeof fetch;

    const { container } = renderPortal();
    await waitFor(() => {
      expect(container.textContent).toContain("Rome Hadrian");
    });
    expect(container.textContent).not.toContain("Rome Aurelius");
  });

  it("renders a skeleton while EnvProvider is still loading", async () => {
    // fetch never resolves — provider stays in not-ready state forever
    global.fetch = vi.fn(() => new Promise(() => {})) as typeof fetch;

    const { container } = renderPortal();
    // Skeleton state should mention "Loading" or similar; no Aurelius/Hadrian rendered.
    expect(container.textContent).toMatch(/loading/i);
    expect(container.textContent).not.toContain("Rome Hadrian");
    expect(container.textContent).not.toContain("Rome Aurelius");
  });

  it("does NOT render a 'Recent activity' card anywhere — activity lives on /history only", async () => {
    // Route by URL: /api/env and (now) useReserveStats→useMarket's /api/market
    // can fire in either order, so answer both rather than a single Once.
    global.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/env")) return { ok: true, json: async () => ({ defaultChainId: 200010 }) } as Response;
      return { ok: true, text: async () => "{}", json: async () => ({}) } as Response;
    }) as typeof fetch;

    const { container } = renderPortal();
    await waitFor(() => {
      expect(container.textContent).toContain("Rome Hadrian");
    });
    // The "Recent activity" eyebrow that ActivityFeed renders must be absent
    // from CompoundPortal — /history is the single source for activity.
    expect(container.textContent).not.toMatch(/Recent activity/i);
  });
});
