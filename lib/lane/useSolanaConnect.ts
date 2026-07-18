"use client";
// =====================================================================
// AERARIUM — shared robust Solana connect
// ONE connect helper used by BOTH the main /solana lane (useSolanaLane) and
// the secondary-page chrome (SolanaLaneShell's ConnectCard). Structural: no
// duplicated connect logic, so the lane + the shell behave identically.
//
// THE RACE IT FIXES: the wallet-adapter's select(name) sets the active wallet
// ASYNCHRONOUSLY (it propagates on the next render via the `wallet` field), but
// connect() throws "WalletNotSelectedError" until `wallet` is set. The old code
// did `select(name); connect().catch(()=>{})` in one tick — connect() ran before
// `wallet` propagated, so the first attempt always failed; it only "worked" the
// first time because autoConnect happened to pick it up, and reconnect-after-
// disconnect (autoConnect already consumed) silently failed.
//
// THE FIX: stash the requested wallet name in a ref, call select(name), and let
// a useEffect fire connect() once the adapter reports `wallet.adapter.name ===
// pending && !connected && !connecting`. The effect clears the pending ref after
// kicking off connect (success OR failure), so it's a one-shot per request and
// never loops. Connect errors are swallowed here (a user-rejected pop-up isn't a
// lane error); the adapter's own `connecting`/`connected` flags drive the UI.
// =====================================================================
import { useCallback, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";

export interface SolanaConnect {
  /** Connect by display name (case-insensitive substring, e.g. "phantom"). */
  connect: (walletName: string) => void;
  /** Disconnect the active wallet (swallows the adapter's reject). */
  disconnect: () => void;
}

/**
 * Robust connect/disconnect over @solana/wallet-adapter-react, shared by the
 * main lane and the sub-page shell. The `connect` returned here is stable and
 * safe to call repeatedly — including reconnect-after-disconnect, which the old
 * select()+connect() race broke.
 */
export function useSolanaConnect(): SolanaConnect {
  const { wallets, wallet, connected, connecting, select, connect, disconnect } = useWallet();

  // The wallet the user asked for but which select() hasn't finished activating
  // yet. The effect below fires connect() once the adapter catches up.
  const pendingRef = useRef<WalletName | null>(null);

  const connectFn = useCallback(
    (walletName: string) => {
      const wanted = walletName.toLowerCase();
      const match = wallets.find((w) => w.adapter.name.toLowerCase().includes(wanted));
      if (!match) return;
      // Already the active wallet (e.g. selected-but-not-connected) → connect now;
      // otherwise stash it and let select() propagate, then the effect connects.
      pendingRef.current = match.adapter.name;
      select(match.adapter.name);
    },
    [wallets, select],
  );

  // Fire connect() once select() has actually activated the pending wallet.
  // Gated on the adapter's own state so we never double-connect or loop.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (connected || connecting) {
      // Already connected/connecting (select picked it up, or autoConnect did) —
      // the request is satisfied; clear it.
      pendingRef.current = null;
      return;
    }
    if (wallet?.adapter.name === pending) {
      // select() has propagated — kick off the connection exactly once.
      pendingRef.current = null;
      void Promise.resolve(connect()).catch(() => {
        /* user-rejected / adapter error — not a lane error; flags drive the UI */
      });
    }
  }, [wallet, connected, connecting, connect]);

  const disconnectFn = useCallback(() => {
    pendingRef.current = null;
    void Promise.resolve(disconnect()).catch(() => {});
  }, [disconnect]);

  return { connect: connectFn, disconnect: disconnectFn };
}
