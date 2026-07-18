"use client";

import { useEffect, useMemo } from "react";
import { WagmiProvider, useConnect } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";

import { config as bootConfig, createWagmiConfig, isMockWallet } from "@/lib/wagmi";
import { useEnv } from "@/lib/env-context";

// In mock-wallet mode, auto-fire connect() once on mount so the connected
// portal renders without a click.  Real-wallet mode leaves this to
// RainbowKit's connect modal.
function MockAutoConnect() {
  const { connect, connectors } = useConnect();
  useEffect(() => {
    if (!isMockWallet) return;
    const mock = connectors.find((c) => c.id === "mockSigning");
    if (mock) connect({ connector: mock });
  }, [connect, connectors]);
  return null;
}

// Builds a wagmi config from the runtime-resolved WalletConnect projectId AND
// chain id (both from /api/env). First render uses the boot config (placeholder
// projectId + build-default chain) so RainbowKit's module init doesn't throw;
// after EnvProvider's /api/env fetch resolves, the config rebuilds with the real
// values. WagmiProvider's key (incl. the chain id) forces a remount on config
// swap so RainbowKit picks up the new projectId AND every wagmi hook re-binds to
// the runtime chain — without threading chainId here, usePublicClient({ chainId })
// returns undefined and the EVM-lane reads silently no-op (the #66 bug, which
// our split inherited from the old combined providers). Reads useEnv(), so it
// must render under RootProviders (which mounts EnvProvider).
function RuntimeWagmiProvider({ children }: { children: React.ReactNode }) {
  const { walletConnectProjectId, defaultChainId, ready } = useEnv();
  const runtimeConfig = useMemo(() => {
    if (!ready) return bootConfig;
    return createWagmiConfig(walletConnectProjectId, defaultChainId ?? undefined);
  }, [walletConnectProjectId, defaultChainId, ready]);
  return (
    <WagmiProvider key={ready ? `runtime-${defaultChainId ?? "default"}` : "boot"} config={runtimeConfig}>
      {children}
    </WagmiProvider>
  );
}

/**
 * EVM-lane providers — Wagmi + RainbowKit. Mounted by app/evm/layout, so this
 * module (and the WalletConnect/AppKit init it triggers) loads ONLY under
 * /evm/*. The TanStack QueryClient is NOT here — it's hoisted to RootProviders
 * (an ancestor via the root layout) so both lanes share one client; wagmi's and
 * RainbowKit's internal hooks resolve it from that ancestor. Requires
 * RootProviders' EnvProvider + QueryClientProvider as ancestors
 * (RuntimeWagmiProvider reads useEnv).
 */
export function EvmProviders({ children }: { children: React.ReactNode }) {
  return (
    <RuntimeWagmiProvider>
      <RainbowKitProvider>
        <MockAutoConnect />
        {children}
      </RainbowKitProvider>
    </RuntimeWagmiProvider>
  );
}
