"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EnvProvider } from "@/lib/env-context";
import { ChainConfigGate } from "./chain-config-gate";

/**
 * Root providers — wallet-agnostic. Mounted once at app/layout for every route,
 * including the read-only landing ("/"), which renders with NO wallet library
 * in the tree OR in its module graph. Only the per-lane layouts add a wallet
 * stack: EvmProviders (app/providers-evm) under /evm, SolanaProviders
 * (app/providers-solana) under /solana.
 *
 * This file deliberately imports NEITHER lib/wagmi NOR the Solana adapters:
 * importing lib/wagmi here would run its module-level getDefaultConfig() on
 * every page (it fires WalletConnect/AppKit init), defeating the landing's
 * wallet-free guarantee. Keep the wallet imports in the per-lane files.
 *
 * The TanStack QueryClient lives here (not in the per-lane providers) so BOTH
 * lanes share ONE client: the shared market cache (useMarket) dedupes across
 * the lane boundary, and the Solana lane — which has no wallet-stack
 * QueryClient of its own — can use useQuery. React Query has no wallet
 * dependency, so it doesn't compromise the landing's wallet-free guarantee.
 *
 * EnvProvider lives here because both lanes read the /api/env snapshot
 * (chain id, WalletConnect projectId), and it has no wallet dependency.
 */
export function RootProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <EnvProvider>
        <ChainConfigGate>{children}</ChainConfigGate>
      </EnvProvider>
    </QueryClientProvider>
  );
}
