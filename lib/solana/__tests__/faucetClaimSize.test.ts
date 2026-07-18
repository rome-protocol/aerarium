// Reproduces the Solana-native faucet "Transaction too large: 2085 > 1232" and
// proves the fix: a heavy DoTxUnsigned (many account metas, e.g. the all-token
// faucet claim) overflows a LEGACY tx but fits in a v0 tx once its non-signer
// accounts are referenced through an Address Lookup Table.
//
// This is why /solana/faucet must submit over the ALT path (submitOverAlt),
// not the inline submitCall path — the same reason borrow/liquidate do.

import { describe, it, expect } from "vitest";
import {
  Keypair,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
  type AccountMeta,
} from "@solana/web3.js";
import { buildDoTxUnsigned } from "../instructions";

const SOLANA_TX_LIMIT = 1232;

// A representative all-token claim touches dozens of accounts (per token: the
// cached wrapper's storage + SPL cache + the synthetic's per-wrapper slot, …);
// the reported failure was 2085 bytes ≈ this many account metas inline.
const CLAIM_ACCOUNT_COUNT = 58;

// Representative unsigned EIP-1559 RLP size (chainId/nonce/fees/gas/to + 4-byte
// claim() selector) — ~100 bytes. The tag byte is prepended by buildDoTxUnsigned.
const RLP = ("0x02" + "ab".repeat(100)) as `0x${string}`;

function claimAccounts(n: number): AccountMeta[] {
  return Array.from({ length: n }, (_, i) => ({
    pubkey: Keypair.generate().publicKey,
    isSigner: i === 0, // [0] is the Phantom payer — stays inline even with an ALT
    isWritable: i % 2 === 0,
  }));
}

describe("Solana-native faucet claim — tx size", () => {
  const programId = Keypair.generate().publicKey;
  const payer = Keypair.generate().publicKey;
  const blockhash = Keypair.generate().publicKey.toBase58(); // valid 32-byte base58
  const accounts = claimAccounts(CLAIM_ACCOUNT_COUNT);
  const ix = buildDoTxUnsigned({ programId, unsignedRlp: RLP, accounts });

  it("overflows the 1232-byte limit as a LEGACY tx (the reported bug)", () => {
    const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight: 0 });
    tx.add(ix);
    // web3.js serialize() THROWS "Transaction too large: N > 1232" past the
    // limit (that's the exact error the operator saw); below it returns a size.
    let size = 0;
    let tooLarge = false;
    try {
      size = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
    } catch (e) {
      tooLarge = /too large|1232/i.test(String(e));
    }
    expect(tooLarge || size > SOLANA_TX_LIMIT).toBe(true);
  });

  it("fits within 1232 bytes as a v0 tx over an ALT (the fix)", () => {
    const nonSigners = accounts.filter((a) => !a.isSigner).map((a) => a.pubkey);
    const alt = new AddressLookupTableAccount({
      key: Keypair.generate().publicKey,
      state: {
        deactivationSlot: 2n ** 64n - 1n,
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        authority: payer,
        addresses: nonSigners,
      },
    });
    const msg = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message([alt]);
    const size = new VersionedTransaction(msg).serialize().length;
    expect(size).toBeLessThanOrEqual(SOLANA_TX_LIMIT);
  });
});
