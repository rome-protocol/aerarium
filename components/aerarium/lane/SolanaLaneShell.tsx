"use client";
// =====================================================================
// AERARIUM — Solana-lane shell for the secondary sub-pages (/solana/faucet,
// /solana/liquidate). Renders the same connected-lane chrome as LaneApp
// (light theme + Solana tint + sticky LaneHeader with the Liquidate/Faucet
// links) so the sub-pages match the main /solana lane. The page bodies keep
// their own lib/solana logic; this only supplies the surrounding chrome + a
// centered container. Mirrors EvmLaneShell for the Solana side.
//
// CONNECTION GATE (structural): by default, when the Phantom/Solflare/Backpack
// wallet is NOT connected the shell renders the SHARED <ConnectCard> in place
// of its children. A page holding PUBLIC, read-only data (e.g.
// /solana/liquidate's underwater-account list — reads run over the lane's
// wallet-independent evmClient) opts OUT with `requireConnection={false}`: the
// body renders while disconnected and the page gates only its write actions.
// Default stays `true`, so the main lane + /solana/faucet are unchanged.
// Connect goes through the SAME robust useSolanaConnect helper the main lane
// uses (the select()/connect() race fix), so reconnect-after-disconnect works.
//
// Uses @solana/wallet-adapter-react (useWallet), so it only mounts under
// SolanaProviders — which app/solana/layout.tsx already provides for all
// /solana/*. The header DISPLAYS the Phantom base58 address (matching the
// main lane), not the internal synthetic EVM address.
// =====================================================================
import "@/app/aerarium-app.css";
import { useWallet } from "@solana/wallet-adapter-react";
import { LaneHeader } from "./LaneHeader";
import { ConnectCard } from "./ConnectCard";
import { SOL_LANE_LINKS } from "./LaneApp";
import { useSolanaConnect } from "@/lib/lane/useSolanaConnect";

// Wallet display names for the ConnectCard — identical to useSolanaLane.wallets
// so the sub-pages offer the same wallet choices as the main lane.
const SOL_WALLETS = ["Phantom", "Solflare", "Backpack"];

export function SolanaLaneShell({
  children,
  requireConnection = true,
}: {
  children: React.ReactNode;
  requireConnection?: boolean;
}) {
  const { publicKey, connected, connecting, wallet } = useWallet();
  // SAME robust connect/disconnect the main lane uses — no duplicated logic.
  const { connect, disconnect } = useSolanaConnect();

  const account =
    connected && publicKey
      ? {
          status: "connected" as const,
          address: publicKey.toBase58(),
          wallet: wallet?.adapter.name,
        }
      : null;

  // Spinner label while connecting — the selected wallet, else the first option.
  const connectingLabel = connecting ? wallet?.adapter.name ?? SOL_WALLETS[0] : null;

  // Show the body when connected, OR when the page opted out of the gate.
  const showChildren = (connected && !!publicKey) || !requireConnection;

  return (
    <div className="aer-connected lane-sol">
      <div className="aer-light-bg" />
      <LaneHeader
        chain="sol"
        account={account}
        extraLinks={SOL_LANE_LINKS}
        onDisconnect={() => disconnect()}
      />
      <div className="aer-app" style={{ paddingTop: 32 }}>
        {showChildren ? (
          children
        ) : (
          <ConnectCard chain="sol" wallets={SOL_WALLETS} connecting={connectingLabel} onConnect={connect} />
        )}
      </div>
    </div>
  );
}
