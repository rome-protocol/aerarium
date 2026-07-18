"use client";

// Per-user T0 (risk-critical) position read, as ONE TanStack query — replaces the
// per-tab raw setInterval(12s) position/balance polling in the lane adapters.
//
// Gating (design §8): the query is `enabled` only on (connected && chainResolved
// && identity present), so it never reads against the build-time default chain
// before /api/env resolves (the latent #76-family bug). The caller composes the
// connected/chainResolved part into `enabled`; this wrapper additionally refuses
// to fire without an `identity`.
//
// Key carries lane + identity so one lane's (more optimistic) position can never
// be served onto the other (positionStats keeps the EVM-real vs Solana-approx
// health split — a shared key would defeat it).
//
// Cadence: refetch 10s / stale 5s, focus-refetch OFF (the interval + post-action
// invalidation cover freshness without a tab-return burst), retry 0 (risk data —
// no keepPreviousData / retry masking of staleness; an error maps to empty at the
// consumer, never an infinite spinner).

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

export interface PositionQueryArgs<T> {
  lane: "evm" | "sol";
  /** MetaMask address (EVM) or synthetic keccak(pubkey)[12:] (Solana). */
  identity: string | undefined;
  chainId: number;
  programId: string;
  /** connected && chainResolved — composed by the caller. */
  enabled: boolean;
  fetcher: () => Promise<T>;
}

export function usePositionQuery<T>({
  lane,
  identity,
  chainId,
  programId,
  enabled,
  fetcher,
}: PositionQueryArgs<T>): UseQueryResult<T> {
  return useQuery({
    queryKey: ["position", lane, identity ?? null, chainId, programId],
    queryFn: fetcher,
    enabled: enabled && identity != null,
    refetchInterval: 10_000,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}
