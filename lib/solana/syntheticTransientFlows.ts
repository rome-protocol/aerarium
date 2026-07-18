// Synthetic-transient flow primitives — the ONE model both the flow harness and
// the production Solana lane use to move assets between the user's Solana WALLET,
// their transient SYNTHETIC (external-auth PDA), and Comet.
//
// Invariant: the synthetic holds nothing at rest. Assets live in the wallet or
// in Comet. So:
//   - "spendable" (what you can supply/repay with) = the WALLET's SPL ATA balance
//     — read here via readWalletSplBalances (Solana RPC), NOT wrapper.balanceOf
//     (synthetic), which is ~0 at rest.
//   - supply/repay route wallet → synthetic (fund leg) → Comet.
//   - withdraw/borrow/buyCollateral land in the synthetic → swept synthetic →
//     wallet (sweep leg), so nothing is stranded.
//
// The look-ahead (lib/lane/laneActions.ts availableFor) is already correct; it
// just needs walletTokens fed from the wallet (readWalletSplBalances) instead of
// the synthetic. This module is the shared source of those reads + the fund/sweep
// instruction builders (extracted from the proven flow harness).

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { encodeFunctionData, type Address, type Hex } from "viem";

import { associatedTokenAddress, externalAuthPda } from "./submit";
import { buildActivateAtaInstruction } from "./instructions";

/** HelperProgram precompile (0xFF…09) — home of transfer_spl (user-PDA-signed). */
export const HELPER_PROGRAM = "0xff00000000000000000000000000000000000009" as Address;

/** transfer_spl(to_ata, tokens, mint) — moves the synthetic's SPL to a dest ATA. */
export const HELPER_TRANSFER_SPL_ABI = [
  {
    type: "function",
    name: "transfer_spl",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to_ata", type: "bytes32" },
      { name: "tokens", type: "uint64" },
      { name: "mint", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

/** Solana pubkey → 0x-prefixed 32-byte hex (the bytes32 the precompiles expect). */
export function pubkeyToBytes32(pk: PublicKey): Hex {
  return `0x${Buffer.from(pk.toBytes()).toString("hex")}`;
}

/**
 * Read the `amount` (u64 LE at offset 64) from a raw SPL token-account buffer.
 * Returns 0 for a null / too-short buffer (an ATA that doesn't exist yet), so a
 * missing wallet ATA reads as a zero balance rather than throwing.
 */
export function parseSplTokenAmount(data: Uint8Array | null | undefined): bigint {
  if (!data || data.length < 72) return 0n;
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(64, true);
}

/**
 * Wallet SPL balances for a set of mints — the look-ahead "spendable" source.
 * Derives each mint's ATA for `wallet`, batch-reads them, and parses the amount
 * (0 for a missing ATA). Parallel to `mints`.
 */
export async function readWalletSplBalances(
  connection: Connection,
  wallet: PublicKey,
  mints: PublicKey[],
  tokenProgram: PublicKey = TOKEN_PROGRAM,
): Promise<bigint[]> {
  if (mints.length === 0) return [];
  const atas = mints.map((m) => associatedTokenAddress(m, wallet, tokenProgram));
  const infos = await connection.getMultipleAccountsInfo(atas);
  return infos.map((info) => parseSplTokenAmount(info?.data));
}

export interface FundLegParams {
  programId: PublicKey;
  chainId: number | bigint;
  mint: PublicKey;
  amount: bigint;
  wallet: PublicKey;
  synthetic: Hex;
  tokenProgram?: PublicKey;
}

/**
 * Fund leg (wallet → synthetic): ensure the synthetic's ATA exists, then move
 * `amount` of `mint` from the wallet's ATA into it (ActivateAta, wallet-signed).
 * Returned as native instructions for a single Phantom-signed tx. The synthetic
 * then `supply`s to Comet and nets back to zero.
 */
export function buildFundLeg(params: FundLegParams): TransactionInstruction[] {
  const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM;
  const synthPda = externalAuthPda(params.programId, params.synthetic);
  const walletAta = associatedTokenAddress(params.mint, params.wallet, tokenProgram);
  const synthAta = associatedTokenAddress(params.mint, synthPda, tokenProgram);

  const ensureSynthAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    params.wallet, // payer
    synthAta,
    synthPda, // owner = synthetic external-auth PDA
    params.mint,
    tokenProgram,
  );
  const activateIx = buildActivateAtaInstruction({
    programId: params.programId,
    chainId: params.chainId,
    mint: params.mint,
    tokens: params.amount,
    signer: params.wallet,
    fromAta: walletAta,
    toAta: synthAta,
    tokenProgram,
  });
  return [ensureSynthAtaIx, activateIx];
}

export interface SweepLegParams {
  programId: PublicKey;
  mint: PublicKey;
  amount: bigint;
  wallet: PublicKey;
  synthetic: Hex;
  tokenProgram?: PublicKey;
}

export interface SweepLeg {
  /** Idempotent create of the wallet's dest ATA (transfer_spl reverts without it). */
  ensureWalletAtaIx: TransactionInstruction;
  /** HelperProgram precompile address (the DoTxUnsigned `to`). */
  helperTo: Address;
  /** transfer_spl(walletAta, amount, mint) calldata. */
  calldata: Hex;
  /**
   * Source(synth ATA) + dest(wallet ATA) — discovery truncates transfer_spl's
   * source when the dest is freshly created, so the caller appends these to the
   * discovered account set (deduped). Both writable.
   */
  extraAccounts: AccountMeta[];
}

/**
 * Sweep leg (synthetic → wallet): push `amount` of `mint` from the synthetic's
 * ATA back to the user's own wallet ATA via HelperProgram.transfer_spl, so the
 * synthetic holds nothing at rest after a withdraw / borrow / buyCollateral.
 */
export function buildSweepLeg(params: SweepLegParams): SweepLeg {
  const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM;
  const synthPda = externalAuthPda(params.programId, params.synthetic);
  const walletAta = associatedTokenAddress(params.mint, params.wallet, tokenProgram);
  const synthAta = associatedTokenAddress(params.mint, synthPda, tokenProgram);

  const ensureWalletAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    params.wallet, // payer
    walletAta,
    params.wallet, // owner = wallet
    params.mint,
    tokenProgram,
  );
  const calldata = encodeFunctionData({
    abi: HELPER_TRANSFER_SPL_ABI,
    functionName: "transfer_spl",
    args: [pubkeyToBytes32(walletAta), params.amount, pubkeyToBytes32(params.mint)],
  });
  const extraAccounts: AccountMeta[] = [
    { pubkey: walletAta, isSigner: false, isWritable: true }, // dest (wallet)
    { pubkey: synthAta, isSigner: false, isWritable: true }, // source (synthetic)
  ];
  return { ensureWalletAtaIx, helperTo: HELPER_PROGRAM, calldata, extraAccounts };
}
