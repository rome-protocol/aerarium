// @vitest-environment jsdom
//
// P0: the TanStack QueryClient must live in RootProviders so BOTH lanes share
// ONE client (the Solana lane has no wallet-stack QueryClient of its own, and
// the shared market cache must dedupe across the lane boundary). Before the
// hoist, useQuery anywhere under RootProviders-but-outside-EvmProviders throws
// "No QueryClient set".
import { it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";

// Isolate the QueryClient behavior — stub EnvProvider to a passthrough so the
// real /api/env fetch doesn't fire in jsdom (mirrors providers-evm.test.tsx).
vi.mock("@/lib/env-context", () => ({
  EnvProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  // ChainConfigGate (also under RootProviders) reads useEnv; a not-ready
  // snapshot keeps it a passthrough.
  useEnv: () => ({ defaultChainId: null, walletConnectProjectId: "", ready: false, error: null }),
}));

import { RootProviders } from "../providers";

function Probe() {
  useQuery({ queryKey: ["p"], queryFn: async () => 1, enabled: false });
  return <div>ok</div>;
}

it("RootProviders supplies a QueryClient to the whole tree", () => {
  render(
    <RootProviders>
      <Probe />
    </RootProviders>,
  );
  expect(screen.getByText("ok")).toBeInTheDocument();
});
