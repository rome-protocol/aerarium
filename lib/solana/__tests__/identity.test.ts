import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { syntheticAddress } from '../identity';

const PIN = '0xb312bec018884c2d66667c67a90508214bd8bafc';

describe('syntheticAddress', () => {
  // Byte-locked to the Rome EVM program do_tx_unsigned::derive_sender (PR #393):
  //   synthetic EVM address = keccak256(pubkey_32_bytes)[12..32]
  // Pin vector copied verbatim from the on-chain test `derive_sender_is_pinned`:
  //   keccak256(0x01 * 32)[12..] == 0xb312bec018884c2d66667c67a90508214bd8bafc
  // If this ever fails, the TS derivation has drifted from the chain and every
  // Solana user's synthetic address (where their EVM balance/nonce lives) is wrong.
  it('matches the on-chain pin vector for a 0x01*32 pubkey', () => {
    const pubkey = new Uint8Array(32).fill(1);
    expect(syntheticAddress(pubkey).toLowerCase()).toBe(PIN);
  });

  it('accepts a @solana/web3.js PublicKey', () => {
    const pk = new PublicKey(new Uint8Array(32).fill(1));
    expect(syntheticAddress(pk).toLowerCase()).toBe(PIN);
  });

  it('accepts a base58 pubkey string', () => {
    const b58 = new PublicKey(new Uint8Array(32).fill(1)).toBase58();
    expect(syntheticAddress(b58).toLowerCase()).toBe(PIN);
  });
});
