"use client";
// useStorefront — polls the Comet storefront (read-only) over any viem
// PublicClient, so both dashboard pages share it (EVM publicClient / Solana
// evmClient). Mirrors useUnhealthyAccounts: refresh on mount + a slow interval,
// keep the prior value on a transient read error. Closed-storefront is cheap
// (3 reads); the per-asset scan only runs when it's open (rare).
import { useCallback, useEffect, useState } from "react";
import type { Address, PublicClient } from "viem";
import { fetchStorefront, type Storefront } from "@/lib/portal/storefront";

export function useStorefront(
  client: PublicClient | undefined,
  comet: Address | undefined,
): { storefront: Storefront | null; loading: boolean } {
  const [storefront, setStorefront] = useState<Storefront | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!client || !comet) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setStorefront(await fetchStorefront(client, comet));
    } catch {
      // Transient — keep the prior storefront; the next tick retries.
    } finally {
      setLoading(false);
    }
  }, [client, comet]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  return { storefront, loading };
}
