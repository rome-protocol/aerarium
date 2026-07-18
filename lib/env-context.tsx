"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export interface EnvSnapshot {
  defaultChainId: number | null;
  /**
   * WalletConnect Cloud projectId, sourced server-side from process.env at
   * runtime (NOT baked into the build via NEXT_PUBLIC_). Empty string when
   * the server env var is unset; consumers fall back to a placeholder.
   */
  walletConnectProjectId: string;
  ready: boolean;
  error: Error | null;
}

interface ApiEnvResponse {
  defaultChainId: number | null;
  walletConnectProjectId?: string;
}

const EnvContext = createContext<EnvSnapshot | null>(null);

export function EnvProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<EnvSnapshot>({
    defaultChainId: null,
    walletConnectProjectId: "",
    ready: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/env")
      .then((r) => {
        if (!r.ok) throw new Error(`/api/env returned ${r.status}`);
        return r.json() as Promise<ApiEnvResponse>;
      })
      .then((body) => {
        if (cancelled) return;
        setSnapshot({
          defaultChainId: body.defaultChainId,
          walletConnectProjectId: body.walletConnectProjectId ?? "",
          ready: true,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSnapshot({
          defaultChainId: null,
          walletConnectProjectId: "",
          ready: false,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <EnvContext.Provider value={snapshot}>{children}</EnvContext.Provider>;
}

export function useEnv(): EnvSnapshot {
  const v = useContext(EnvContext);
  if (!v) {
    throw new Error("useEnv() must be called inside <EnvProvider>");
  }
  return v;
}
