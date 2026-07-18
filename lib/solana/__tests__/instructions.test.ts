import { describe, it, expect } from 'vitest';
import { PublicKey, type AccountMeta } from '@solana/web3.js';
import {
  DO_TX_UNSIGNED_TAG,
  ACTIVATE_ATA_TAG,
  buildDoTxUnsigned,
  buildActivateAtaData,
  buildActivateAtaInstruction,
  ownerInfoPda,
} from '../instructions';

// Instruction tags = 0-indexed position in the Rome EVM program entrypoint! list
// (program/src/lib.rs). Verified against the macro (Instruction enum, #[repr(u8)],
// dispatched on d[0]) + the slot-14/15 doc comment.
describe('instruction tags', () => {
  it('pins DoTxUnsigned=17 and ActivateAta=18', () => {
    expect(DO_TX_UNSIGNED_TAG).toBe(17);
    expect(ACTIVATE_ATA_TAG).toBe(18);
  });
});

describe('buildDoTxUnsigned', () => {
  const programId = new PublicKey(new Uint8Array(32).fill(9));
  const accounts: AccountMeta[] = [
    { pubkey: new PublicKey(new Uint8Array(32).fill(2)), isSigner: true, isWritable: true },
    { pubkey: new PublicKey(new Uint8Array(32).fill(3)), isSigner: false, isWritable: true },
    { pubkey: PublicKey.default, isSigner: false, isWritable: false },
  ];
  const rlp = '0xdd01808080809411111111111111111111111111111111111111118080c0' as const;

  it('prefixes data with tag byte 17 then the raw unsigned RLP', () => {
    const ix = buildDoTxUnsigned({ programId, unsignedRlp: rlp, accounts });
    expect(ix.data[0]).toBe(17);
    expect(Buffer.from(ix.data.subarray(1)).toString('hex')).toBe(rlp.slice(2));
    expect(ix.data.length).toBe(1 + (rlp.length - 2) / 2);
  });

  it('passes through programId and the discovered account metas unchanged', () => {
    const ix = buildDoTxUnsigned({ programId, unsignedRlp: rlp, accounts });
    expect(ix.programId.equals(programId)).toBe(true);
    expect(ix.keys.length).toBe(3);
    expect(ix.keys[0].pubkey.equals(accounts[0].pubkey)).toBe(true);
    expect(ix.keys[0].isSigner).toBe(true);
    expect(ix.keys[1].isWritable).toBe(true);
    expect(ix.keys[2].isSigner).toBe(false);
  });
});

describe('buildActivateAtaData', () => {
  // the Rome EVM program activate_ata::args decodes d[1..] as:
  //   chain_id: u64 (LE, split_u64 = from_le_bytes) ‖ mint: Pubkey (32) ‖ tokens: u64 (LE)
  // exactly 48 payload bytes (errors if any trailing bytes). Tag byte = 18.
  // Hand-computed golden for chain=200010 (0x30D4A), mint=0x02*32, tokens=1_000_000 (0xF4240):
  //   12 | 4a0d030000000000 | 02*32 | 40420f0000000000   (0x30D4A LE = 4a 0d 03 ..)
  it('encodes tag + chainId(LE) + mint + tokens(LE) — golden vector', () => {
    const mint = new PublicKey(new Uint8Array(32).fill(2));
    const data = buildActivateAtaData({ chainId: 200010, mint, tokens: 1_000_000n });
    expect(data.toString('hex')).toBe(
      '12' + '4a0d030000000000' + '02'.repeat(32) + '40420f0000000000',
    );
  });

  it('produces exactly 49 bytes (1 tag + 48 payload) and reads back', () => {
    const mint = new PublicKey(new Uint8Array(32).fill(7));
    const data = buildActivateAtaData({ chainId: 200010, mint, tokens: 42n });
    expect(data.length).toBe(49);
    expect(data[0]).toBe(ACTIVATE_ATA_TAG);
    expect(data.readBigUInt64LE(1)).toBe(200010n);
    expect(Buffer.from(data.subarray(9, 41)).toString('hex')).toBe('07'.repeat(32));
    expect(data.readBigUInt64LE(41)).toBe(42n);
  });
});

describe('buildActivateAtaInstruction', () => {
  // activate_ata.rs accounts: signer(s+w), mint(r), from_ata(w), to_ata(w),
  // token_program(r). State::signer needs exactly one signer+writable; the
  // transfer_checked CPI needs from/mint/to + the token program in the tx.
  const programId = new PublicKey(new Uint8Array(32).fill(9));
  const mint = new PublicKey(new Uint8Array(32).fill(2));
  const signer = new PublicKey(new Uint8Array(32).fill(1));
  const fromAta = new PublicKey(new Uint8Array(32).fill(3));
  const toAta = new PublicKey(new Uint8Array(32).fill(4));
  const tokenProgram = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  it('assembles tag-18 data + 5 accounts in order with correct flags', () => {
    const ix = buildActivateAtaInstruction({
      programId, chainId: 200010, mint, tokens: 10_000_000n, signer, fromAta, toAta, tokenProgram,
    });
    expect(ix.programId.equals(programId)).toBe(true);
    expect(ix.data[0]).toBe(ACTIVATE_ATA_TAG);
    expect(ix.data.length).toBe(49);
    // signer(s+w), owner_info(r) [State::new requires the chain OwnerInfo PDA],
    // mint(r), fromAta(w), toAta(w), tokenProgram(r)
    const ownerInfo = ownerInfoPda(programId).toBase58();
    expect(ix.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable])).toEqual([
      [signer.toBase58(), true, true],
      [ownerInfo, false, false],
      [mint.toBase58(), false, false],
      [fromAta.toBase58(), false, true],
      [toAta.toBase58(), false, true],
      [tokenProgram.toBase58(), false, false],
    ]);
  });
});
