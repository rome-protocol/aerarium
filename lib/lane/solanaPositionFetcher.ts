// The Solana lane's per-user T0 read, as ONE pure async fetcher for
// usePositionQuery to call. It composes the EXISTING reads — readSolanaPosition
// (the synthetic's batched Comet/wrapper multicall) joined with the user's live
// wallet SPL balances (readWalletSplBalances) — and buildSolanaReadsAndStats,
// mirroring useSolanaLane.refreshPosition's body.
//
// THE FIX (design §8): today, on a wallet-read failure the lane silently keeps
// the synthetic-sourced walletRaw (≈ 0 under the synthetic-transient model) →
// "supply 0" on a funded wallet. This fetcher instead surfaces `walletUnknown`
// so the lane can render "balance unavailable" + disable supply, never act on a
// misleading 0. (The synthetic position / capacity / health are independent of
// the wallet read and stand on their own.)

import type { Address, Hex } from "viem";
import { Connection, PublicKey } from "@solana/web3.js";
import { readSolanaPosition, type SolanaPositionMeta } from "./solanaReads";
import { buildSolanaReadsAndStats, type SolanaAssetRead, type SolanaAssetResolved } from "./mapSolanaPosition";
import { readWalletSplBalances } from "@/lib/solana/syntheticTransientFlows";
import type { LaneLimits } from "@/components/aerarium/lane/types";

export interface SolanaPositionResult {
  reads: SolanaAssetRead[];
  /** The pre-fold resolved rows — the lane rebuilds the activity USD lookup from
   *  these (buildActivityLookup), so activity stays driven off the same read. */
  resolved: SolanaAssetResolved[];
  borrowCapacityUSD: number;
  healthFactor: number | null;
  limits: LaneLimits | undefined;
  /** The wallet-SPL leg failed (or couldn't run) — supply ceilings can't be
   *  trusted; the lane shows "balance unavailable" instead of a misleading 0. */
  walletUnknown: boolean;
}

export interface FetchSolanaPositionArgs {
  evmClient: Parameters<typeof readSolanaPosition>[0];
  comet: Address;
  synthetic: Hex;
  assetMetas: SolanaPositionMeta[];
  connection: Connection;
  publicKey: PublicKey | null;
  basePriceUSDx8: bigint;
}

export async function fetchSolanaPosition({
  evmClient,
  comet,
  synthetic,
  assetMetas,
  connection,
  publicKey,
  basePriceUSDx8,
}: FetchSolanaPositionArgs): Promise<SolanaPositionResult> {
  const { resolved, market } = await readSolanaPosition(
    evmClient,
    comet,
    synthetic,
    assetMetas,
    basePriceUSDx8,
  );

  // Re-source spendable balances from the user's SOLANA WALLET ATA (assets live
  // there under the synthetic-transient model). A failure → walletUnknown, NOT a
  // silent synthetic-0 fallback (the latent bug this fixes).
  let walletUnknown = false;
  const mintStrs = assetMetas.map((m) => m.mint);
  if (publicKey && mintStrs.every((m): m is string => m != null)) {
    try {
      const mints = mintStrs.map((m) => new PublicKey(m));
      const walletBals = await readWalletSplBalances(connection, publicKey, mints);
      resolved.forEach((rr, i) => {
        rr.walletRaw = walletBals[i] ?? rr.walletRaw;
      });
    } catch {
      walletUnknown = true;
    }
  }

  const { reads, borrowCapacityUSD, healthFactor, limits } = buildSolanaReadsAndStats(resolved, market);
  return { reads, resolved, borrowCapacityUSD, healthFactor, limits, walletUnknown };
}
