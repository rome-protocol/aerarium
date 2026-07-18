/**
 * Client-side nonce sequencer for a synthetic EVM address. Seed it from the
 * address's on-chain count (eth_getTransactionCount) once, then `reserve()` a
 * nonce per DoTxUnsigned in a multi-step chain so later steps don't collide
 * with earlier-but-unconfirmed ones. `reset()` re-syncs after confirmation.
 */
export class SyntheticNonceTracker {
  private next: bigint;

  constructor(seed: bigint | number) {
    this.next = BigInt(seed);
  }

  /** The nonce the next reserve() will return, without consuming it. */
  peek(): bigint {
    return this.next;
  }

  /** Return the current nonce and advance by one. */
  reserve(): bigint {
    const n = this.next;
    this.next += 1n;
    return n;
  }

  /** Re-sync to a freshly fetched on-chain count. */
  reset(seed: bigint | number): void {
    this.next = BigInt(seed);
  }
}
