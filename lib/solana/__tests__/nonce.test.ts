import { describe, it, expect } from 'vitest';
import { SyntheticNonceTracker } from '../nonce';

// A Solana-native multi-step chain (e.g. approve -> supply) builds several
// DoTxUnsigned txs before the first confirms, so the second must carry
// nonce = seed+1 locally. The tracker is seeded from the synthetic address's
// on-chain count (eth_getTransactionCount) and hands out incrementing nonces.
describe('SyntheticNonceTracker', () => {
  it('hands out sequential nonces starting at the seed', () => {
    const t = new SyntheticNonceTracker(5);
    expect(t.peek()).toBe(5n);
    expect(t.reserve()).toBe(5n);
    expect(t.reserve()).toBe(6n);
    expect(t.peek()).toBe(7n);
  });

  it('accepts a bigint seed', () => {
    const t = new SyntheticNonceTracker(0n);
    expect(t.reserve()).toBe(0n);
    expect(t.reserve()).toBe(1n);
  });

  it('reset re-syncs to a fresh on-chain count (e.g. after confirmation)', () => {
    const t = new SyntheticNonceTracker(5);
    t.reserve();
    t.reserve();
    t.reset(2);
    expect(t.peek()).toBe(2n);
    expect(t.reserve()).toBe(2n);
  });
});
