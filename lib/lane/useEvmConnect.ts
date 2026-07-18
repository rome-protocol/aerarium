"use client";
// =====================================================================
// AERARIUM — EVM-lane connect hook (reusable, single-source)
// The connector-resolution + connecting-spinner logic that EvmLaneShell used
// to inline, lifted so the shell AND the lane sub-pages (e.g. /evm/liquidate,
// which renders its body read-only while disconnected and gates only the
// Absorb write) share ONE implementation — mirrors lib/lane/useSolanaConnect
// for the Solana side. No duplicated connector matching → no drift.
// Only mounts under EvmProviders (uses wagmi hooks).
// =====================================================================
import { useAccount, useConnect, useDisconnect } from "wagmi";

// Wallet display names — identical to useEvmLane.wallets so every EVM connect
// surface (main lane, shell, sub-page gate) offers the same choices.
export const EVM_WALLETS = ["MetaMask", "Rabby", "WalletConnect"];

export interface EvmConnect {
  connected: boolean;
  /** Spinner label while a connection is in flight, else null. */
  connecting: string | null;
  address?: `0x${string}`;
  wallet?: string;
  wallets: string[];
  /** Connect a wallet by name (case-insensitive substring); omit → first/injected. */
  onConnect: (walletName?: string) => void;
  disconnect: () => void;
}

export function useEvmConnect(): EvmConnect {
  const { address, connector, status } = useAccount();
  const { connectors, connect, status: connectStatus, variables } = useConnect();
  const { disconnect } = useDisconnect();

  const connected = status === "connected" && !!address;

  // Match the connector whose name contains the requested wallet, else fall
  // back to an injected connector, else the first available.
  const onConnect = (walletName?: string) => {
    const wanted = (walletName ?? EVM_WALLETS[0]).toLowerCase();
    const match =
      connectors.find((c) => c.name.toLowerCase().includes(wanted)) ??
      connectors.find((c) => c.type === "injected") ??
      connectors[0];
    if (match) connect({ connector: match });
  };

  const connecting =
    connectStatus === "pending"
      ? variables?.connector && "name" in variables.connector
        ? (variables.connector.name as string)
        : EVM_WALLETS[0]
      : status === "connecting" || status === "reconnecting"
        ? connector?.name ?? EVM_WALLETS[0]
        : null;

  return { connected, connecting, address, wallet: connector?.name, wallets: EVM_WALLETS, onConnect, disconnect };
}
