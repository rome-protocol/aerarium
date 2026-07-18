import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  NATIVE_FAUCET_PROGRAM,
  CLAIM_TAG,
  reserveAuthorityPda,
  claimedMarkerPda,
  buildNativeFaucetClaimIx,
} from '../nativeFaucet';
import { associatedTokenAddress } from '../submit';

const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');

// Deterministic, distinct fixtures.
const user = new PublicKey(new Uint8Array(32).fill(7));
const mintA = new PublicKey(new Uint8Array(32).fill(11));
const mintB = new PublicKey(new Uint8Array(32).fill(13));

describe('NATIVE_FAUCET_PROGRAM', () => {
  it('defaults to the deployed native faucet program id', () => {
    // env-override default (mirrors ALT_REGISTRY_PROGRAM); the deployed id.
    expect(NATIVE_FAUCET_PROGRAM.toBase58()).toBe(
      '541ZWNGfvw7ZurRRgQAEs1i3UEAFff7HUEL69oV4jeoW',
    );
  });
});

describe('reserveAuthorityPda', () => {
  it('derives the [b"reserve"] PDA under the program', () => {
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from('reserve')],
      NATIVE_FAUCET_PROGRAM,
    );
    expect(reserveAuthorityPda().equals(expected)).toBe(true);
  });
});

describe('claimedMarkerPda', () => {
  it('derives the per-user [b"claimed", user] one-time marker PDA', () => {
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from('claimed'), user.toBuffer()],
      NATIVE_FAUCET_PROGRAM,
    );
    expect(claimedMarkerPda(user).equals(expected)).toBe(true);
  });

  it('is distinct per wallet', () => {
    const other = new PublicKey(new Uint8Array(32).fill(9));
    expect(claimedMarkerPda(user).equals(claimedMarkerPda(other))).toBe(false);
  });
});

describe('buildNativeFaucetClaimIx', () => {
  it('targets the native faucet program with tag-0 data', () => {
    const ix = buildNativeFaucetClaimIx({ user, mints: [mintA] });
    expect(ix.programId.equals(NATIVE_FAUCET_PROGRAM)).toBe(true);
    expect(ix.data.length).toBe(1);
    expect(ix.data[0]).toBe(CLAIM_TAG);
    expect(CLAIM_TAG).toBe(0);
  });

  it('lays out 6 fixed accounts then 3 per mint', () => {
    const ix = buildNativeFaucetClaimIx({ user, mints: [mintA, mintB] });
    expect(ix.keys.length).toBe(6 + 3 * 2);
  });

  it('pins the fixed prefix: user(s,w), reserve(ro), claimed marker(w), 3 programs(ro)', () => {
    const ix = buildNativeFaucetClaimIx({ user, mints: [mintA] });
    expect(ix.keys[0]).toMatchObject({ pubkey: user, isSigner: true, isWritable: true });
    expect(ix.keys[1]).toMatchObject({ pubkey: reserveAuthorityPda(), isSigner: false, isWritable: false });
    // The one-time claimed marker — writable (the program creates it on first claim).
    expect(ix.keys[2].pubkey.equals(claimedMarkerPda(user))).toBe(true);
    expect(ix.keys[2]).toMatchObject({ isSigner: false, isWritable: true });
    expect(ix.keys[3]).toMatchObject({ pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false });
    expect(ix.keys[4]).toMatchObject({ pubkey: ATA_PROGRAM, isSigner: false, isWritable: false });
    expect(ix.keys[5]).toMatchObject({ pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false });
  });

  it('per mint: mint(ro) + reserve ATA(rw) + user ATA(rw), bound to canonical ATAs', () => {
    const ix = buildNativeFaucetClaimIx({ user, mints: [mintA, mintB] });
    const reserve = reserveAuthorityPda();
    [mintA, mintB].forEach((mint, i) => {
      const base = 6 + i * 3;
      expect(ix.keys[base]).toMatchObject({ pubkey: mint, isSigner: false, isWritable: false });
      expect(ix.keys[base + 1].pubkey.equals(associatedTokenAddress(mint, reserve, TOKEN_PROGRAM))).toBe(true);
      expect(ix.keys[base + 1].isWritable).toBe(true);
      expect(ix.keys[base + 2].pubkey.equals(associatedTokenAddress(mint, user, TOKEN_PROGRAM))).toBe(true);
      expect(ix.keys[base + 2].isWritable).toBe(true);
    });
  });

  it('rejects an empty mint set (the program needs at least one mint group)', () => {
    expect(() => buildNativeFaucetClaimIx({ user, mints: [] })).toThrow();
  });
});
