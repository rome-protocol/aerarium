"use client";
// =====================================================================
// AERARIUM — EVM-lane shell for the secondary sub-pages (/evm/liquidate,
// /evm/faucet). Renders the same connected-lane chrome as LaneApp (light
// theme + EVM tint + sticky LaneHeader with the Liquidate/Faucet links) so
// the sub-pages match the main lane. The page bodies keep their own wagmi
// logic; this only supplies the surrounding chrome + a centered container.
//
// CONNECTION GATE (structural): by default, when the wallet is NOT connected
// the shell renders the SHARED <ConnectCard> in place of its children — so a
// gated page (e.g. /evm/faucet) offers a working connect when disconnected
// rather than a dead "go to the lane" prompt. A page that holds PUBLIC,
// read-only data (e.g. /evm/liquidate's underwater-account list — reads need
// only an RPC client, no wallet) opts OUT with `requireConnection={false}`:
// the body then renders even while disconnected, and the page is responsible
// for gating just its write actions behind connect. Default stays `true` so
// existing gated sub-pages are unchanged.
//
// Connect logic comes from the shared useEvmConnect hook (single source —
// mirrors useSolanaConnect), so the shell, the main lane, and the sub-page
// gates resolve connectors identically. Only mounts under EvmProviders.
// =====================================================================
import "@/app/aerarium-app.css";
import { LaneHeader } from "./LaneHeader";
import { ConnectCard } from "./ConnectCard";
import { EVM_LANE_LINKS } from "./LaneApp";
import { useEvmConnect } from "@/lib/lane/useEvmConnect";

export function EvmLaneShell({
  children,
  requireConnection = true,
}: {
  children: React.ReactNode;
  requireConnection?: boolean;
}) {
  const { connected, connecting, address, wallet, wallets, onConnect, disconnect } = useEvmConnect();

  const account = connected ? { status: "connected" as const, address: address!, wallet } : null;

  // Show the body when connected, OR when the page opted out of the gate.
  const showChildren = connected || !requireConnection;

  return (
    <div className="aer-connected lane-evm">
      <div className="aer-light-bg" />
      <LaneHeader
        chain="evm"
        account={account}
        extraLinks={EVM_LANE_LINKS}
        onDisconnect={() => disconnect()}
      />
      <div className="aer-app" style={{ paddingTop: 32 }}>
        {showChildren ? (
          children
        ) : (
          <ConnectCard chain="evm" wallets={wallets} connecting={connecting} onConnect={onConnect} />
        )}
      </div>
    </div>
  );
}
