"use client";

// /faucet — one-click test funds for Aerarium (test/devnet chains only).
//
// Mirrors a companion Aave demo's /faucet shape: one-time claim per wallet,
// fixed gas + token drops. Unlike Aave's (which mints from MockToken),
// the Compound faucet *transfers* from a pre-funded balance because the
// underlying SPL_ERC20_cached wrappers have no public mint. The Solidity
// contract (`contracts/test/CompoundFaucet.sol` in compound-on-rome-comet)
// + the operator's pre-funding via `scripts/hadrian-vanilla/deploy-
// faucet.ts` handle the supply side; this page just renders the claim
// affordance.

import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { formatUnits } from "viem";

import { EvmLaneShell } from "@/components/aerarium/lane/EvmLaneShell";
import { Button } from "@/components/ui/Button";
import { useEnv } from "@/lib/env-context";
import { configForChain, DEFAULT_CHAIN_CONFIG } from "@/lib/config";
import { getCompoundConfig } from "@/lib/registry";
import { buffered } from "@/lib/gas";
import { explorerTxUrl } from "@/lib/explorer";

const FAUCET_ABI = [
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "claimed",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

type Phase = "idle" | "ready" | "claiming" | "success" | "error" | "already-claimed";

export default function FaucetPage() {
  const { defaultChainId } = useEnv();
  const activeChainId = defaultChainId ?? DEFAULT_CHAIN_CONFIG.rome.chainId;
  const activeConfig = useMemo(() => configForChain(activeChainId) ?? DEFAULT_CHAIN_CONFIG, [activeChainId]);
  // Faucet metadata lives on the full registry config, not the legacy
  // wagmi-friendly shape. `getCompoundConfig` returns the typed
  // CompoundChainConfig (which carries the optional `faucet` block).
  const fullConfig = useMemo(() => getCompoundConfig(activeChainId), [activeChainId]);
  const faucet = fullConfig?.faucet;

  const { address, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: activeChainId });
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<Phase>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: alreadyClaimed, refetch: refetchClaimed } = useReadContract({
    address: faucet?.address,
    abi: FAUCET_ABI,
    functionName: "claimed",
    args: address ? [address] : undefined,
    chainId: activeChainId,
    query: {
      enabled: !!address && !!faucet && walletChainId === activeChainId,
      refetchInterval: 8_000,
      staleTime: 4_000,
    },
  });

  useEffect(() => {
    if (!faucet) return;
    if (!isConnected) {
      setPhase("idle");
      return;
    }
    if (walletChainId !== activeChainId) return;
    if (alreadyClaimed === true) {
      setPhase("already-claimed");
      return;
    }
    if (alreadyClaimed === false) {
      setPhase((p) => (p === "claiming" || p === "success" || p === "error" ? p : "ready"));
    }
  }, [isConnected, walletChainId, alreadyClaimed, faucet, activeChainId]);

  const { isSuccess: txMined } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    chainId: activeChainId,
    query: { enabled: !!txHash },
  });
  useEffect(() => {
    if (txMined && phase === "claiming") {
      setPhase("success");
      void refetchClaimed();
    }
  }, [txMined, phase, refetchClaimed]);

  const onActiveChain = walletChainId === activeChainId;

  async function switchToActive() {
    setError(null);
    try {
      await switchChainAsync({ chainId: activeChainId });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function claim() {
    if (!address || !publicClient || !faucet) return;
    setError(null);
    setPhase("claiming");
    try {
      const estimated = await publicClient.estimateContractGas({
        account: address,
        address: faucet.address,
        abi: FAUCET_ABI,
        functionName: "claim",
        args: [],
      });
      const gas = buffered(estimated);
      const hash = await writeContractAsync({
        address: faucet.address,
        abi: FAUCET_ABI,
        functionName: "claim",
        args: [],
        chainId: activeChainId,
        gas,
      });
      setTxHash(hash);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage ?? err.message ?? String(e));
      setPhase("error");
    }
  }

  // Render — three macro-states:
  //   1. Faucet not deployed on this chain → "unavailable" message.
  //   2. Faucet available, wallet flow drives phase.
  if (!faucet) {
    return (
      <EvmLaneShell>
        <section style={{ marginBottom: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 14, color: "var(--fg2)" }}>
            Faucet
          </div>
          <h1 style={heroStyle}>Faucet not deployed on this chain.</h1>
          <p style={subStyle}>
            The test-funds faucet is only available on chains that have a CompoundFaucet contract registered. {activeConfig.rome.name} doesn&apos;t (yet).
          </p>
        </section>
      </EvmLaneShell>
    );
  }

  const gasDrop = formatUnits(faucet.gasDropWei, 18);

  return (
    <EvmLaneShell>
      <section style={{ marginBottom: 28 }}>
        <div className="eyebrow" style={{ marginBottom: 14, color: "var(--fg2)" }}>
          Faucet
        </div>
        <h1 style={heroStyle}>
          Test funds for <em style={{ fontStyle: "italic" }}>{activeConfig.rome.name}</em>.
        </h1>
        <p style={subStyle}>
          One-time claim per wallet. Drops <strong style={{ color: "var(--fg1)" }}>{gasDrop} native gas</strong> + <strong style={{ color: "var(--fg1)" }}>{faucet.tokens.length > 0 ? `${formatUnits(faucet.tokens[0].dropAmountWei, faucet.tokens[0].decimals)} of each mock token` : "test tokens"}</strong> ({faucet.tokens.map((t) => t.symbol).join(" / ")}) so you can test supply, borrow, and liquidation flows without bridging from Solana. wUSDC / wETH / wSOL / wBTC aren&apos;t dripped — bridge them in via the Rome web app or the chain&apos;s deposit flow.
        </p>
      </section>

      <div style={cardStyle}>
        <div className="eyebrow" style={{ color: "var(--fg2)", marginBottom: 12 }}>You&apos;ll receive</div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", fontFamily: "var(--font-mono)", fontSize: 13 }}>
          <li style={liStyle}>
            <span style={{ color: "var(--fg1)" }}>Native gas</span>
            <span style={{ color: "var(--fg-brand)" }}>{gasDrop} ROME</span>
          </li>
          {faucet.tokens.map((t) => (
            <li key={t.symbol} style={liStyle}>
              <span style={{ color: "var(--fg1)" }}>{t.symbol}</span>
              <span style={{ color: "var(--fg-brand)" }}>{formatUnits(t.dropAmountWei, t.decimals)} {t.symbol}</span>
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 24 }}>
          {!isConnected ? (
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) =>
                mounted ? (
                  <Button variant="primary" size="md" onClick={openConnectModal}>
                    Connect wallet
                  </Button>
                ) : null
              }
            </ConnectButton.Custom>
          ) : !onActiveChain ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ color: "var(--fg2)", fontSize: 13, margin: 0 }}>
                Wallet on chain {walletChainId ?? "?"}; switch to {activeConfig.rome.name} ({activeChainId}) to claim.
              </p>
              <Button variant="primary" size="md" onClick={switchToActive}>
                Switch to {activeConfig.rome.name}
              </Button>
            </div>
          ) : phase === "ready" ? (
            <Button variant="primary" size="md" fullWidth onClick={claim}>
              Claim test funds
            </Button>
          ) : phase === "claiming" ? (
            <Button variant="primary" size="md" fullWidth disabled>
              Claiming… check your wallet
            </Button>
          ) : phase === "success" ? (
            <div style={successBanner}>
              Funds dropped. Check your wallet for {gasDrop} ROME + {faucet.tokens.length} test tokens.
              {txHash && (
                <>
                  <br />
                  <a
                    href={explorerTxUrl(activeConfig.rome.explorerUrl, txHash)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--hf-safe)" }}
                  >
                    View transaction ↗
                  </a>
                </>
              )}
            </div>
          ) : phase === "already-claimed" ? (
            <div style={warnBanner}>
              This wallet has already claimed. Switch to a fresh address if you need more.
            </div>
          ) : phase === "error" ? (
            <div style={errorBanner}>{error || "Unknown error"}</div>
          ) : (
            <Button variant="primary" size="md" fullWidth disabled>
              Checking…
            </Button>
          )}
        </div>

        <details style={{ marginTop: 24, fontSize: 12, color: "var(--fg2)" }}>
          <summary style={{ cursor: "pointer" }}>Contract details</summary>
          <div style={{ marginTop: 12, fontFamily: "var(--font-mono)" }}>
            <div>Chain: {activeConfig.rome.name} ({activeChainId})</div>
            <div>Faucet: {faucet.address}</div>
            {faucet.tokens.map((t) => (
              <div key={t.symbol}>
                {t.symbol}: {t.address}
              </div>
            ))}
          </div>
        </details>
      </div>
    </EvmLaneShell>
  );
}

const heroStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-serif)",
  fontWeight: 400,
  fontSize: "clamp(32px, 5vw, 44px)",
  lineHeight: 1.05,
  letterSpacing: "-0.02em",
  color: "var(--fg1)",
  maxWidth: 780,
};

const subStyle: React.CSSProperties = {
  margin: "12px 0 0",
  maxWidth: 720,
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  lineHeight: 1.55,
  color: "var(--fg2)",
};

const cardStyle: React.CSSProperties = {
  maxWidth: 560,
  width: "100%",
  background: "var(--bg-surface)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 12,
  padding: 24,
};

const liStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "6px 0",
};

const successBanner: React.CSSProperties = {
  padding: "12px 16px",
  background: "rgba(92, 207, 166, 0.10)",
  border: "1px solid rgba(92, 207, 166, 0.35)",
  borderRadius: 8,
  color: "var(--hf-safe)",
  fontSize: 14,
};

const warnBanner: React.CSSProperties = {
  padding: "12px 16px",
  background: "rgba(232, 160, 78, 0.10)",
  border: "1px solid rgba(232, 160, 78, 0.35)",
  borderRadius: 8,
  color: "var(--hf-warn)",
  fontSize: 14,
};

const errorBanner: React.CSSProperties = {
  padding: "12px 16px",
  background: "rgba(226, 106, 106, 0.10)",
  border: "1px solid rgba(226, 106, 106, 0.35)",
  borderRadius: 8,
  color: "var(--hf-danger)",
  fontSize: 13,
  fontFamily: "var(--font-mono)",
};
