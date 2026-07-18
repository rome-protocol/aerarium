"use client";

import type { ReactNode } from "react";

import { useEnv } from "@/lib/env-context";
import { configForChain } from "@/lib/config";

/**
 * Fail-loud guard for the runtime-chain / build-snapshot mismatch.
 *
 * The runtime default chain (/api/env, set per deployment) MUST exist in the
 * registry snapshot bundled at build time (lib/registry/generated.json). When
 * it doesn't, chainFor() silently falls back to the build-default chain, the
 * wagmi config never registers the runtime chain id, usePublicClient({ chainId })
 * returns undefined, and every read no-ops — the UI hangs on
 * "Loading your positions…" with no error (the aerarium-martius incident).
 * This gate turns that silent hang into an explicit, actionable error page.
 *
 * Wallet-free by design (reads only env-context + lib/config), so it is safe
 * to mount in RootProviders without breaking the landing's no-wallet-imports
 * guarantee.
 */
export function ChainConfigGate({ children }: { children: ReactNode }) {
  const { ready, defaultChainId } = useEnv();

  const unknownChain =
    ready && defaultChainId != null && configForChain(defaultChainId) === undefined;

  if (!unknownChain) return <>{children}</>;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "var(--font-sans, sans-serif)",
      }}
    >
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, color: "var(--marble, #e8e6e1)" }}>
          Configuration error
        </h1>
        <p style={{ margin: "12px 0 0", fontSize: 14.5, lineHeight: 1.55, color: "var(--marble-2, #b8b5ae)" }}>
          This deployment is set to chain <strong>{defaultChainId}</strong>, which is not included
          in this build. Balances and positions cannot load until the build is updated.
        </p>
        <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--marble-2, #b8b5ae)" }}>
          Operators: regenerate <code>lib/registry/generated.json</code> against current registry
          main (<code>npm run build:registry-config</code>), rebuild the image, and redeploy.
        </p>
      </div>
    </main>
  );
}
