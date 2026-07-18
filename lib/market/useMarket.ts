"use client";

// Client hook over the shared market endpoint. ONE TanStack query (deduped
// across components AND both lanes via the RootProviders QueryClient) replaces
// the per-tab 12s setInterval reserve/activity polling. staleTime 15s +
// refetchInterval 30s match the T2 shared tier; refetchOnWindowFocus off (the
// interval + post-action invalidation cover freshness without a focus burst).

import { useQuery } from "@tanstack/react-query";
import { reviveBigints } from "./bigintJson";
// Type-only — never import cachedMarket's runtime into the client bundle (it
// pulls next/cache + viem + config, all server-only).
import type { MarketState } from "./cachedMarket";
import type { ActivityRow, OpenLiquidation } from "./MarketSource";

export interface MarketResponse {
  state: MarketState;
  activity: ActivityRow[];
  liquidatable: OpenLiquidation[];
}

export function useMarket(chainId: number | null | undefined) {
  return useQuery({
    queryKey: ["market", chainId],
    queryFn: () =>
      fetch(`/api/market/${chainId}`)
        .then((r) => r.text())
        .then((t) => reviveBigints<MarketResponse>(t)),
    enabled: chainId != null,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
}
