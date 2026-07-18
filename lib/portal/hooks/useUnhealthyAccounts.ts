"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";

import { fetchUnhealthyAccounts } from "@/lib/portal/fetchUnhealthyAccounts";

const REFRESH_MS = 30_000;

export interface UseUnhealthyAccountsResult {
  accounts: Address[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Scan recent Comet activity for accounts with non-empty positions, then
 * probe each via comet.isLiquidatable. Returns deduped list of
 * liquidatable addresses.
 *
 * Polls every 30s — slower than balance hooks since liquidation events
 * are rare and the scan is relatively heavy.
 *
 * Read-only — no signer required. The scan/probe core lives in
 * lib/portal/fetchUnhealthyAccounts (client-agnostic, shared with the Solana
 * lane); this hook just supplies wagmi's PublicClient + the polling lifecycle.
 */
export function useUnhealthyAccounts(
  comet: Address | undefined,
  chainId: number,
): UseUnhealthyAccountsResult {
  const publicClient = usePublicClient({ chainId });
  const [accounts, setAccounts] = useState<Address[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!comet || !publicClient) {
      setAccounts(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const liquidatable = await fetchUnhealthyAccounts(publicClient, comet);
      setAccounts(liquidatable);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [comet, publicClient]);

  useEffect(() => {
    void load();
    if (!comet) return;
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load, comet]);

  return { accounts, loading, error, refresh: load };
}
