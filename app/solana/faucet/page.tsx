"use client";

// /solana/faucet — Solana-native test funds for Aerarium.
//
// Driven by Phantom with NO Ethereum key. Targets the NATIVE SPL faucet program
// (programs/native-faucet): a single `claim` (tag 0) drops a fixed amount of
// EVERY configured token straight into the caller's own PHANTOM WALLET
// associated-token-account in ONE Solana tx under ONE signature (the program
// creates each wallet ATA idempotently and transfers from a reserve PDA). A
// native SPL transfer is a few-K CU, so all tokens fit one cheap legacy tx — vs
// the EVM SelfServeFaucet's ~220K CU + one Phantom popup per token.
//
// The faucet token list + display amounts come from the registry faucet config;
// the per-token underlying SPL mint is read from each wrapper's mint_id(). The
// drop amount is program policy (fixed on-chain), not client-supplied. Wrapped
// in SolanaLaneShell for the violet SOLANA-GATE chrome + header links.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import { formatUnits, type Address, type Hex } from "viem";

import { SolanaLaneShell } from "@/components/aerarium/lane/SolanaLaneShell";
import { useSolanaActions } from "@/lib/lane/useSolanaActions";
import { buildNativeFaucetClaimIx, claimedMarkerPda, NATIVE_FAUCET_PROGRAM } from "@/lib/solana/nativeFaucet";
import { solanaExplorerTx } from "@/lib/solana/explorer";
import { getCompoundConfig } from "@/lib/registry";
import { Button } from "@/components/landing/primitives";
import { eyebrow } from "@/components/aerarium/lane/primitives";

// Each cached wrapper exposes mint_id() → the underlying SPL mint as bytes32.
const MINT_ID_ABI = [
  { type: "function", name: "mint_id", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bytes32" }] },
] as const;

// bytes32 → Solana PublicKey (32 raw bytes).
const mintFromB32 = (hex: Hex): PublicKey => new PublicKey(Buffer.from(hex.slice(2), "hex"));

// CU envelope for the native claim. Measured ~143K CU for 6 tokens; 600K is a
// safe ceiling well under Solana's 1.4M per-tx cap.
const CLAIM_CU_LIMIT = 600_000;

type Phase = "idle" | "claiming" | "success" | "error";

export default function SolanaFaucetPage() {
  const { synthetic, publicKey, evmClient, cfg, submitRaw } = useSolanaActions();
  const { connection } = useConnection();
  const faucet = useMemo(() => getCompoundConfig(cfg.chainId)?.faucet, [cfg.chainId]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [sig, setSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One-time-per-wallet gate: the program creates a [b"claimed", wallet] marker
  // on first claim. If it already exists, this wallet has claimed — show that
  // instead of the button. null = unknown (read pending / failed; the on-chain
  // guard is the real backstop, so a transient read failure leaves the button on).
  const [alreadyClaimed, setAlreadyClaimed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setAlreadyClaimed(null);
      return;
    }
    let cancelled = false;
    connection
      .getAccountInfo(claimedMarkerPda(publicKey))
      .then((info) => {
        if (!cancelled) setAlreadyClaimed(info !== null);
      })
      .catch(() => {
        if (!cancelled) setAlreadyClaimed(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey, connection, phase]);

  const claim = useCallback(async () => {
    if (!faucet || !publicKey || faucet.tokens.length === 0) return;
    setError(null);
    setPhase("claiming");
    try {
      // Resolve every configured token's underlying SPL mint (wrapper.mint_id()),
      // then build ONE native claim ix that drops them all to the wallet.
      const mints = await Promise.all(
        faucet.tokens.map(async (t) => {
          const mintB32 = (await evmClient.readContract({
            address: t.address as Address,
            abi: MINT_ID_ABI,
            functionName: "mint_id",
          })) as Hex;
          return mintFromB32(mintB32);
        }),
      );
      const claimIx = buildNativeFaucetClaimIx({ user: publicKey, mints });
      const signature = await submitRaw([
        ComputeBudgetProgram.setComputeUnitLimit({ units: CLAIM_CU_LIMIT }),
        claimIx,
      ]);
      setSig(signature);
      setPhase("success");
    } catch (e: unknown) {
      // The submit helper appends the on-chain program logs after a newline
      // (the instruction error / CU-exceeded / heap fault live there). Surface
      // the full thing — console for the complete trace, banner for the tail.
      console.error("[faucet] claim failed:", e);
      const err = e as { shortMessage?: string; message?: string };
      const full = err.message ?? err.shortMessage ?? String(e);
      setError(full.length > 600 ? `${full.slice(0, 600)}\n… (full logs in console)` : full);
      setPhase("error");
    }
  }, [faucet, publicKey, evmClient, submitRaw]);

  // The Solana-native faucet needs a configured token list. Chains without a
  // faucet block (mainnet) render an "unavailable" message.
  if (!faucet || faucet.tokens.length === 0) {
    return (
      <SolanaLaneShell>
        <section style={{ marginBottom: 28 }}>
          <div style={{ ...eyebrow, marginBottom: 14 }}>Faucet</div>
          <h1 className="aer-display" style={{ margin: 0, fontWeight: 400, fontSize: "clamp(32px, 5vw, 44px)", maxWidth: 780 }}>
            Faucet not available on this chain.
          </h1>
          <p style={subStyle}>
            The Solana-native test-funds faucet is only available on chains with a faucet configured. This chain ({cfg.chainId}) doesn&apos;t (yet).
          </p>
        </section>
      </SolanaLaneShell>
    );
  }

  // Connection is guaranteed by SolanaLaneShell (it renders the shared
  // ConnectCard when disconnected), so this body assumes a connected wallet.
  return (
    <SolanaLaneShell>
      <section style={{ marginBottom: 28 }}>
        <div style={{ ...eyebrow, marginBottom: 14 }}>Faucet</div>
        <h1 className="aer-display" style={{ margin: 0, fontWeight: 400, fontSize: "clamp(32px, 5vw, 44px)", maxWidth: 780 }}>
          Test funds, the <em style={{ fontStyle: "italic" }}>Solana-native</em> way.
        </h1>
        <p style={subStyle}>
          One signature drops{" "}
          <strong style={{ color: "var(--marble)" }}>test tokens</strong> ({faucet.tokens.map((t) => t.symbol).join(" / ")})
          {" "}straight to your <strong style={{ color: "var(--marble)" }}>Phantom wallet</strong> so you can test supply, borrow, and liquidation flows. Signed in Phantom, settled on Solana — no MetaMask, one transaction.
        </p>
      </section>

      <div style={cardStyle}>
        <div style={{ ...eyebrow, marginBottom: 12 }}>You&apos;ll receive</div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", fontFamily: "var(--font-mono)", fontSize: 13 }}>
          {faucet.tokens.map((t) => (
            <li key={t.symbol} style={liStyle}>
              <span style={{ color: "var(--marble)" }}>{t.symbol}</span>
              <span style={{ color: "var(--lane)" }}>
                {formatUnits(BigInt(t.dropAmountWei), t.decimals)} {t.symbol}
              </span>
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 24 }}>
          {phase === "claiming" ? (
            <Button variant="gold" size="md" full>Claiming all tokens… check Phantom</Button>
          ) : phase === "success" ? (
            <div style={successBanner}>
              Funds dropped — test tokens are now in your Phantom wallet.
              {sig && (
                <>
                  <br />
                  <a href={solanaExplorerTx(sig, cfg.solanaCluster)} target="_blank" rel="noreferrer" style={{ color: "var(--pos)" }}>
                    View transaction ↗
                  </a>
                </>
              )}
            </div>
          ) : phase === "error" ? (
            <div>
              <div style={errorBanner}>{error || "Unknown error"}</div>
              <div style={{ marginTop: 12 }}>
                <Button variant="gold" size="md" full onClick={claim}>Try again</Button>
              </div>
            </div>
          ) : alreadyClaimed === true ? (
            <div style={warnBanner}>This wallet has already claimed. Each wallet can claim once — connect a fresh Solana wallet if you need more test funds.</div>
          ) : (
            <Button variant="gold" size="md" full onClick={claim}>Claim test funds (1 signature)</Button>
          )}
        </div>

        <details style={{ marginTop: 24, fontSize: 12, color: "var(--marble-2)" }}>
          <summary style={{ cursor: "pointer" }}>Contract details</summary>
          <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", color: "var(--marble-2)" }}>
            <div>Chain: {cfg.chainId}</div>
            <div>Faucet program: {NATIVE_FAUCET_PROGRAM.toBase58()}</div>
            <div>Your wallet: {publicKey?.toBase58() ?? "—"}</div>
            <div>Synthetic (msg.sender): {synthetic}</div>
            {faucet.tokens.map((t) => (
              <div key={t.symbol}>
                {t.symbol}: {t.address}
              </div>
            ))}
          </div>
        </details>
      </div>
    </SolanaLaneShell>
  );
}

const subStyle: React.CSSProperties = {
  margin: "12px 0 0",
  maxWidth: 720,
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  lineHeight: 1.55,
  color: "var(--marble-2)",
};

const cardStyle: React.CSSProperties = {
  maxWidth: 560,
  width: "100%",
  background: "var(--paper)",
  border: "1px solid var(--stone-line)",
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
  color: "var(--pos)",
  fontSize: 14,
};

const warnBanner: React.CSSProperties = {
  padding: "12px 16px",
  background: "rgba(232, 160, 78, 0.10)",
  border: "1px solid rgba(232, 160, 78, 0.35)",
  borderRadius: 8,
  color: "var(--marble-2)",
  fontSize: 14,
};

const errorBanner: React.CSSProperties = {
  padding: "12px 16px",
  background: "rgba(226, 106, 106, 0.10)",
  border: "1px solid rgba(226, 106, 106, 0.35)",
  borderRadius: 8,
  color: "#c0392b",
  fontSize: 13,
  fontFamily: "var(--font-mono)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 240,
  overflowY: "auto",
};
