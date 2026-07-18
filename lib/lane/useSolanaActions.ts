"use client";
// =====================================================================
// AERARIUM — Solana-lane signer hook (reusable)
// A thin, page-agnostic version of the DoTxUnsigned signing primitives that
// power the Solana lane. The Solana-native sub-pages (/solana/faucet,
// /solana/liquidate) need the SAME proven flows useSolanaLane uses to drive
// EVM Compound-v3 actions from a Phantom wallet with NO Ethereum key — but
// they don't need the full LaneAdapter (position polling, Activate, action
// state machine). So this hook exposes just the building blocks:
//   - synthetic / connected / publicKey / cfg / evmClient (reads)
//   - submitCall(to, data)     single DoTxUnsigned (discover → Phantom-sign → submit)
//   - submitOverAlt(to, data)  heavy v0 leg over the shared per-comet ALT (1 popup)
//   - discover(to, data)       account discovery (rome_emulateCallAccounts)
//
// The submitCall / submitOverAlt / discover bodies are LIFTED VERBATIM from
// lib/lane/useSolanaLane.ts (same DoTxUnsigned / persistent-ALT / compute-budget
// / /api/discovery logic — both attach the registry comet + chain ALTs).
// useSolanaLane is intentionally NOT refactored to consume this — the working
// lane is left untouched to avoid any regression; a little duplication of the
// submit body is the safe trade. Methods stay stable via the same
// useCallback([]) + fresh-state ref pattern useSolanaLane uses.
// =====================================================================
import { useCallback, useMemo, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
  type AccountMeta,
} from "@solana/web3.js";
import {
  createPublicClient,
  http,
  defineChain,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { syntheticAddress } from "@/lib/solana/identity";
import { resolveProbeConfig, type ProbeConfig } from "@/lib/solana/probeConfig";
import { clusterToChain, makeChainAwareSign, type BareSign } from "@/lib/solana/signWithChain";
import {
  submitDoTxUnsigned,
  submitV0Instructions,
  submitInstructions,
  computeBudgetIxs,
} from "@/lib/solana/submit";
import type { TransactionInstruction } from "@solana/web3.js";
import { fetchPersistentAlts } from "@/lib/solana/persistentAlts";
import { buildDoTxUnsigned } from "@/lib/solana/instructions";
import { buildUnsignedEip1559Rlp } from "@/lib/solana/unsignedTx";
import { emulateCallAccounts } from "@/lib/solana/discovery";
import { estimateGasBuffered } from "@/lib/gas";
import { useEnv } from "@/lib/env-context";

// Account-discovery + DoTxUnsigned submit go through SAME same-origin routes the
// discovery probe + useSolanaLane use: /api/discovery forwards to the #353 proxy
// (DISCOVERY_PROXY_UPSTREAM, default localhost:9090); the DoTxUnsigned submits
// over the wallet-adapter `connection`, whose endpoint is the same-origin
// /api/solana-rpc proxy → private SOLANA_RPC server-side (providers-solana.tsx).
const DISCOVERY_ROUTE = "/api/discovery";

// Multicall3 (from the chain config) — same one useSolanaLane + lib/wagmi
// use; lets viem fold reads into aggregate3 eth_calls.

// Literal NEXT_PUBLIC_ refs so Next inlines them client-side (same as the lane).
const ENV = {
  NEXT_PUBLIC_DISCOVERY_PROXY_URL: process.env.NEXT_PUBLIC_DISCOVERY_PROXY_URL,
  NEXT_PUBLIC_SOLANA_RPC: process.env.NEXT_PUBLIC_SOLANA_RPC,
  NEXT_PUBLIC_ROME_EVM_PROGRAM: process.env.NEXT_PUBLIC_ROME_EVM_PROGRAM,
  NEXT_PUBLIC_ROME_CHAIN_ID: process.env.NEXT_PUBLIC_ROME_CHAIN_ID,
  NEXT_PUBLIC_COMET_PROXY: process.env.NEXT_PUBLIC_COMET_PROXY,
  NEXT_PUBLIC_UNIFIED_TOKEN: process.env.NEXT_PUBLIC_UNIFIED_TOKEN,
};

export interface SolanaActions {
  /** Synthetic EVM identity keccak(solana_pubkey)[12:], or null when disconnected. */
  synthetic: Hex | null;
  connected: boolean;
  publicKey: PublicKey | null;
  cfg: ProbeConfig;
  /** viem read client over /api/rome-rpc (multicall3-aware). */
  evmClient: PublicClient;
  /** Submit one EVM call as a single DoTxUnsigned (discover → Phantom-sign → submit). */
  submitCall: (to: Address, data: Hex) => Promise<string>;
  /**
   * Submit one heavy DoTx leg over the registry's persistent comet + chain ALTs
   * in one v0 tx — the proven path for calls whose account set overflows the
   * 1232-byte legacy limit. The tables (cfg.persistentAlts) are operator-owned
   * and shared across all users, so this just fetches them; accounts they don't
   * cover are encoded inline.
   */
  submitOverAlt: (to: Hex, data: Hex, cuLimit?: number) => Promise<string>;
  /** Discover an EVM call's complete Solana account list (rome_emulateCallAccounts). */
  discover: (to: Hex, data: Hex) => Promise<AccountMeta[]>;
  /**
   * Submit raw pre-built Solana instructions in ONE Phantom-signed legacy tx
   * (1 signature). For native Solana programs (e.g. the native faucet) that act
   * directly on the wallet — no synthetic, no DoTxUnsigned, no discovery.
   */
  submitRaw: (instructions: TransactionInstruction[]) => Promise<string>;
}

export function useSolanaActions(): SolanaActions {
  // Runtime chain id from /api/env (EnvProvider) — see useSolanaLane. cfg
  // recomputes when the runtime value resolves; NEXT_PUBLIC_ROME_CHAIN_ID still
  // wins as a build-time pin.
  const { defaultChainId } = useEnv();
  const cfg = useMemo(() => resolveProbeConfig(ENV, defaultChainId), [defaultChainId]);
  const { connection } = useConnection();
  const { publicKey, connected, wallet, signTransaction } = useWallet();

  // Chain-aware sign: forward the registry cluster as the wallet-standard
  // `chain` on every sign request so Phantom previews on the right cluster (its
  // connect default is mainnet-beta, where the devnet rome-evm program + ALTs
  // don't exist → "Failed to simulate"). Falls back to the bare signTransaction
  // for non-standard adapters. See lib/solana/signWithChain.ts.
  const signTx = useMemo<BareSign | undefined>(() => {
    if (!signTransaction) return undefined;
    return makeChainAwareSign(wallet?.adapter ?? null, signTransaction, clusterToChain(cfg.solanaCluster));
  }, [wallet, signTransaction, cfg.solanaCluster]);

  const synthetic = useMemo<Hex | null>(
    () => (publicKey ? syntheticAddress(publicKey) : null),
    [publicKey],
  );

  // viem read client over the demo's /api/rome-rpc proxy (same as the lane's
  // evmClient) — reads the synthetic's balances / faucet.claimed / isLiquidatable.
  const evmClient = useMemo<PublicClient>(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const chain = defineChain({
      id: cfg.chainId,
      name: "Rome",
      nativeCurrency: { name: "gas", symbol: "GAS", decimals: 18 },
      rpcUrls: { default: { http: [`${origin}/api/rome-rpc`] } },
      contracts: cfg.multicall3 ? { multicall3: { address: cfg.multicall3 } } : undefined,
    });
    return createPublicClient({ chain, transport: http(`${origin}/api/rome-rpc`) });
  }, [cfg.chainId]);

  // Fresh-state ref so the submit helpers stay stable callbacks (mirrors
  // useSolanaLane's ref pattern — the imperative methods never change identity).
  const ref = useRef({ publicKey, signTransaction: signTx, synthetic, connection, evmClient, cfg });
  ref.current = { publicKey, signTransaction: signTx, synthetic, connection, evmClient, cfg };

  // --- Lifted verbatim from useSolanaLane.submitCall ---
  // Submit one EVM call as a DoTxUnsigned (discover → sign in Phantom → submit →
  // confirm). Same gasPrice/estimate/nonce + submitDoTxUnsigned shape.
  const submitCall = useCallback(async (to: Address, data: Hex): Promise<string> => {
    const r = ref.current;
    const synth = r.synthetic!;
    const pk = r.publicKey!;
    const sign = r.signTransaction!;
    const gasPrice = await r.evmClient.getGasPrice();
    const gasLimit = await estimateGasBuffered(r.evmClient, { account: synth, to, data });
    const nonce = await r.evmClient.getTransactionCount({ address: synth });
    const { signature } = await submitDoTxUnsigned(
      {
        call: { to, data },
        payer: pk,
        nonce: BigInt(nonce),
        fee: { maxFeePerGas: gasPrice, maxPriorityFeePerGas: gasPrice, gasLimit },
      },
      {
        proxyUrl: DISCOVERY_ROUTE,
        connection: r.connection,
        programId: new PublicKey(r.cfg.programId),
        chainId: r.cfg.chainId,
        signTransaction: (tx: Transaction) => sign(tx),
      },
    );
    return signature;
  }, []);

  // --- Lifted verbatim from useSolanaLane.discover ---
  // Discover an EVM call's complete account list (rome_emulateCallAccounts via
  // /api/discovery) — the proxy appends treasure + balance_key, so used as-is.
  const discover = useCallback(async (to: Hex, data: Hex): Promise<AccountMeta[]> => {
    const r = ref.current;
    return emulateCallAccounts(DISCOVERY_ROUTE, { from: r.synthetic!, to, data }, r.publicKey!.toBase58());
  }, []);

  // --- Lifted verbatim from useSolanaLane.submitOverAlt ---
  // Submit one DoTx leg over the registry's PERSISTENT ALTs in a single v0 tx
  // (1 popup) — the proven heavy path (discovery submitAtomicBundle, 1 leg). The
  // comet + chain ALTs (cfg.persistentAlts) are operator-owned + shared, so this
  // just fetches them (no per-user ALT). Uncovered accounts go inline automatically.
  const submitOverAlt = useCallback(async (to: Hex, data: Hex, cuLimit = 1_400_000): Promise<string> => {
    const r = ref.current;
    const programId = new PublicKey(r.cfg.programId);
    const synth = r.synthetic!;
    const pk = r.publicKey!;
    const sign = r.signTransaction!;
    const accounts = await emulateCallAccounts(DISCOVERY_ROUTE, { from: synth, to, data }, pk.toBase58());
    const lookupTables = await fetchPersistentAlts(r.connection, r.cfg.persistentAlts);
    const gasPrice = await r.evmClient.getGasPrice();
    const nonce = await r.evmClient.getTransactionCount({ address: synth });
    const dotxIx = buildDoTxUnsigned({
      programId,
      unsignedRlp: buildUnsignedEip1559Rlp({
        chainId: r.cfg.chainId,
        nonce: BigInt(nonce),
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: gasPrice,
        gasLimit: 2_000_000n,
        to,
        data,
      }),
      accounts,
    });
    const { signature } = await submitV0Instructions(
      [...computeBudgetIxs(cuLimit), dotxIx],
      lookupTables,
      { connection: r.connection, feePayer: pk, signTransaction: (tx: VersionedTransaction) => sign(tx) },
    );
    return signature;
  }, []);

  // --- Raw legacy-ix submit (no synthetic / DoTxUnsigned / discovery) ---
  // For native Solana programs that act on the wallet directly (the native
  // faucet's `claim`): assemble the given ixs into one legacy tx, Phantom signs
  // as fee payer, send + confirm. One signature, all ixs.
  const submitRaw = useCallback(async (instructions: TransactionInstruction[]): Promise<string> => {
    const r = ref.current;
    const { signature } = await submitInstructions(instructions, {
      connection: r.connection,
      feePayer: r.publicKey!,
      signTransaction: (tx: Transaction) => r.signTransaction!(tx),
    });
    return signature;
  }, []);

  return {
    synthetic,
    connected: connected && !!publicKey,
    publicKey: publicKey ?? null,
    cfg,
    evmClient,
    submitCall,
    submitOverAlt,
    discover,
    submitRaw,
  };
}
