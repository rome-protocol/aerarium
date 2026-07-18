"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import type { CometMarket } from "./useCometMarket";

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const REFRESH_MS = 12_000;

export interface UseWalletBalancesResult {
  /** Map: lowercased asset address → raw balance bigint. null when account or market is missing. */
  balances: Record<string, bigint> | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Reads the connected user's ERC20 balanceOf for every asset in a Comet
 * market (base + all collats). Returns a map keyed by lowercased asset
 * address. Polls every 12s; refreshes on chainId / account / market change.
 *
 * Returns null balances when no account is connected or the market hasn't
 * loaded yet — distinguishes "no wallet" from "wallet with zero balances".
 */
export function useWalletBalances(
  market: CometMarket | null,
  account: Address | undefined,
  chainId: number,
): UseWalletBalancesResult {
  const publicClient = usePublicClient({ chainId });
  const [balances, setBalances] = useState<Record<string, bigint> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!market || !publicClient || !account) {
      setBalances(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const targets = [market.baseToken, ...market.assets.map((a) => a.asset)];
      const results = await Promise.all(
        targets.map((addr) =>
          publicClient.readContract({
            address: addr,
            abi: ERC20_BALANCE_ABI,
            functionName: "balanceOf",
            args: [account],
          }),
        ),
      );
      const map: Record<string, bigint> = {};
      targets.forEach((addr, i) => {
        map[addr.toLowerCase()] = results[i] as bigint;
      });
      setBalances(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [market, publicClient, account]);

  useEffect(() => {
    void load();
    if (!account || !market) return;
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load, account, market]);

  return { balances, loading, error, refresh: load };
}
