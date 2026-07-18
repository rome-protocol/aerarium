import {
  PublicKey,
  TransactionInstruction,
  type AccountMeta,
} from '@solana/web3.js';
import { associatedTokenAddress } from './submit';

/**
 * Client for the native SPL test-token faucet (programs/native-faucet).
 *
 * One `claim` (tag 0) drops a program-fixed amount of every requested mint into
 * the caller's OWN wallet ATA in a SINGLE Solana tx under ONE signature: the
 * program creates each user ATA idempotently and transfers from a reserve ATA
 * owned by the `[b"reserve"]` authority PDA (signed by the program via
 * invoke_signed). A native SPL transfer is a few-K CU, so N mints fit one cheap
 * tx — versus the EVM SelfServeFaucet's ~220K CU + one Phantom popup per token.
 *
 * The set of mints comes from the ACCOUNTS list, not the data, and the drop
 * amount is program-fixed — a caller can't smuggle an amount or over-draw.
 *
 * Account layout for `claim` (mirrors programs/native-faucet/src/lib.rs):
 *   [0] user                     signer, writable (fee payer + recipient owner)
 *   [1] reserve authority        the [b"reserve"] PDA (NOT a signer)
 *   [2] claimed marker           the [b"claimed", user] PDA, writable — the
 *                                program creates it on the FIRST claim and
 *                                reverts if it already exists (one-time/wallet)
 *   [3] token program            == spl_token::id()
 *   [4] associated token program == spl_associated_token_account::id()
 *   [5] system program           == system_program::id()
 *   then per mint (3 accounts each):
 *     mint        (readonly)
 *     reserve ATA (writable)  == ATA(reserve authority, mint)
 *     user ATA    (writable)  == ATA(user, mint)
 */

export const NATIVE_FAUCET_PROGRAM = new PublicKey(
  process.env.NEXT_PUBLIC_NATIVE_FAUCET_PROGRAM ??
    '541ZWNGfvw7ZurRRgQAEs1i3UEAFff7HUEL69oV4jeoW',
);

/** Instruction tag for `claim` (the program's only instruction). */
export const CLAIM_TAG = 0;

const RESERVE_SEED = Buffer.from('reserve');
const CLAIMED_SEED = Buffer.from('claimed');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');

/** Derive the reserve authority PDA `[b"reserve"]`. Pure — no network. */
export function reserveAuthorityPda(
  programId: PublicKey = NATIVE_FAUCET_PROGRAM,
): PublicKey {
  return PublicKey.findProgramAddressSync([RESERVE_SEED], programId)[0];
}

/**
 * Derive the per-wallet one-time claim marker PDA `[b"claimed", user]`. The
 * program creates this account on the user's FIRST claim and reverts if it
 * already exists, so each wallet can claim exactly once. Pure — no network.
 * The UI also reads it (getAccountInfo): present ⇒ already claimed.
 */
export function claimedMarkerPda(
  user: PublicKey,
  programId: PublicKey = NATIVE_FAUCET_PROGRAM,
): PublicKey {
  return PublicKey.findProgramAddressSync([CLAIMED_SEED, user.toBuffer()], programId)[0];
}

/**
 * Build the native faucet `claim` instruction: drops every `mints` token to
 * `user`'s own wallet ATA in one tx. Source ATAs are bound to the reserve
 * authority's ATAs and dest ATAs to the user's — the on-chain program re-checks
 * both, so a spoofed source/dest is rejected. Pure — no network.
 */
export function buildNativeFaucetClaimIx(params: {
  user: PublicKey;
  mints: PublicKey[];
  programId?: PublicKey;
}): TransactionInstruction {
  const { user, mints } = params;
  const programId = params.programId ?? NATIVE_FAUCET_PROGRAM;
  if (mints.length === 0) {
    throw new Error('native faucet claim needs at least one mint');
  }
  const reserve = reserveAuthorityPda(programId);
  const claimed = claimedMarkerPda(user, programId);

  const keys: AccountMeta[] = [
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: reserve, isSigner: false, isWritable: false },
    { pubkey: claimed, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: ATA_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
  ];
  for (const mint of mints) {
    keys.push({ pubkey: mint, isSigner: false, isWritable: false });
    keys.push({ pubkey: associatedTokenAddress(mint, reserve, TOKEN_PROGRAM), isSigner: false, isWritable: true });
    keys.push({ pubkey: associatedTokenAddress(mint, user, TOKEN_PROGRAM), isSigner: false, isWritable: true });
  }

  return new TransactionInstruction({
    programId,
    keys,
    data: Buffer.from([CLAIM_TAG]),
  });
}
