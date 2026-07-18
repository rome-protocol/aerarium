"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";

import { resolveProbeConfig, solanaRpcEndpoint } from "@/lib/solana/probeConfig";

// Wallet-Standard auto-detects installed wallets (Phantom, Solflare, …), so the
// explicit adapter list is empty — matches the proven discovery-probe wiring.
const SOLANA_WALLETS: never[] = [];

/**
 * Solana-lane providers — connection + wallet adapter + modal. Mounted by
 * app/solana/layout, so this module (and the Solana wallet libraries) loads
 * ONLY under /solana/*. The connection endpoint defaults to the same-origin
 * /api/solana-rpc proxy (resolved against window.location.origin), which
 * forwards server-side to the private SOLANA_RPC — so the RPC URL never reaches
 * the client. NEXT_PUBLIC_SOLANA_RPC still overrides with an absolute URL for
 * local dev (direct-to-RPC). Shared with the discovery probe via resolveProbeConfig.
 */
export function SolanaProviders({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => {
    const { solanaRpc } = resolveProbeConfig({
      NEXT_PUBLIC_SOLANA_RPC: process.env.NEXT_PUBLIC_SOLANA_RPC,
    });
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return solanaRpcEndpoint(solanaRpc, origin);
  }, []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={SOLANA_WALLETS} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
