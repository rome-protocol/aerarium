import { TransactionInstruction, PublicKey, type AccountMeta } from '@solana/web3.js';
import { hexToBytes, type Hex } from 'viem';

/**
 * the Rome EVM program instruction tags = 0-indexed position in the `entrypoint!`
 * list (program/src/lib.rs). The on-chain dispatcher reads `d[0]` as the tag
 * and passes `d[1..]` as the payload.
 */
export const DO_TX_UNSIGNED_TAG = 17;
export const ACTIVATE_ATA_TAG = 18;

/**
 * DoTxUnsigned instruction: a Solana key originates an atomic EVM tx from an
 * unsigned EIP-1559 RLP payload. `from` is derived on-chain from the Solana
 * signer (no ECDSA signature). `accounts` is the list returned by the proxy's
 * rome_emulateCallAccounts discovery RPC — order + signer/writable flags are
 * authoritative and passed through unchanged.
 */
export function buildDoTxUnsigned(params: {
  programId: PublicKey;
  unsignedRlp: Hex;
  accounts: AccountMeta[];
}): TransactionInstruction {
  const data = Buffer.concat([
    Buffer.from([DO_TX_UNSIGNED_TAG]),
    Buffer.from(hexToBytes(params.unsignedRlp)),
  ]);
  return new TransactionInstruction({
    programId: params.programId,
    keys: params.accounts,
    data,
  });
}

/**
 * ActivateAta instruction payload (tag + data) for the Rome EVM program
 * `activate_ata::args`, which decodes:
 *   chain_id: u64 (little-endian) ‖ mint: Pubkey (32 bytes) ‖ tokens: u64 (little-endian)
 * On-chain this transfers `tokens` of `mint` from the Solana signer's ATA into
 * the signer's synthetic-account PDA-ATA (the "funding in" step). The account
 * list is assembled at call time (and verified against live state in the
 * discovery probe), so this returns just the instruction data.
 */
export function buildActivateAtaData(params: {
  chainId: number | bigint;
  mint: PublicKey;
  tokens: bigint;
}): Buffer {
  const data = Buffer.alloc(1 + 8 + 32 + 8);
  data.writeUInt8(ACTIVATE_ATA_TAG, 0);
  data.writeBigUInt64LE(BigInt(params.chainId), 1);
  Buffer.from(params.mint.toBytes()).copy(data, 9);
  data.writeBigUInt64LE(params.tokens, 41);
  return data;
}

/** Chain OwnerInfo/config PDA — single seed [OWNER_INFO]. State::new requires it. */
export function ownerInfoPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('OWNER_INFO')], programId);
  return pda;
}

/**
 * Full ActivateAta Solana instruction — moves `tokens` of `mint` from the
 * signer's ATA into the synthetic account's PDA-ATA. Accounts per
 * `activate_ata.rs` + `State::new`: signer(s+w), owner_info(r), mint(r),
 * fromAta(w), toAta(w), tokenProgram(r). NOT a DoTxUnsigned (no VM) — so no
 * treasure wallet / ComputeBudget heap frame; the signer authorizes the SPL
 * transfer natively.
 */
export function buildActivateAtaInstruction(params: {
  programId: PublicKey;
  chainId: number | bigint;
  mint: PublicKey;
  tokens: bigint;
  signer: PublicKey;
  fromAta: PublicKey;
  toAta: PublicKey;
  tokenProgram: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: params.signer, isSigner: true, isWritable: true },
      { pubkey: ownerInfoPda(params.programId), isSigner: false, isWritable: false },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: params.fromAta, isSigner: false, isWritable: true },
      { pubkey: params.toAta, isSigner: false, isWritable: true },
      { pubkey: params.tokenProgram, isSigner: false, isWritable: false },
    ],
    data: buildActivateAtaData({
      chainId: params.chainId,
      mint: params.mint,
      tokens: params.tokens,
    }),
  });
}
