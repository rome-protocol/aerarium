// Live recent-activity hook — pulls user-touching logs from the Comet
// market over a rolling block window, decodes via lib/portal/activity.ts,
// returns the most-recent N entries enriched with block timestamps.

"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { fetchRecentActivity } from "../activity";
import type { ActivityEntryTimed } from "../groupByDay";

// Re-export for consumers that previously imported ActivityEntry from here
// and now want the timed flavor.
export type { ActivityEntryTimed } from "../groupByDay";

const REFRESH_MS = 12_000;

export interface UseRecentActivityResult {
  entries: ActivityEntryTimed[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useRecentActivity(
  comet: Address | undefined,
  user: Address | undefined,
  chainId: number,
): UseRecentActivityResult {
  const publicClient = usePublicClient({ chainId });
  const [entries, setEntries] = useState<ActivityEntryTimed[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!comet || !user || !publicClient) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const enriched = await fetchRecentActivity(publicClient, comet, user);
      setEntries(enriched);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load activity";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [comet, user, publicClient]);

  useEffect(() => {
    load();
    if (!comet || !user) return;
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load, comet, user]);

  return { entries, loading, error, refresh: load };
}
