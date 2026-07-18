import { describe, it, expect, vi } from 'vitest';
import { PublicKey, Transaction, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import { SolanaSignTransaction } from '@solana/wallet-standard-features';
import { clusterToChain, makeChainAwareSign, type BareSign } from '../signWithChain';

// ---------------------------------------------------------------------------
// clusterToChain — pure registry-cluster → wallet-standard chain id mapping.
// The registry stores cluster as the bare Solana cluster name (chain.json
// #solana.cluster, e.g. "devnet"); the wallet-standard SolanaSignTransaction
// feature wants a CAIP-2-ish "solana:<cluster>" identifier. Must generalize:
// a mainnet chain MUST map to solana:mainnet (NOT hardcode devnet).
// ---------------------------------------------------------------------------
describe('clusterToChain', () => {
  it('maps devnet → solana:devnet', () => {
    expect(clusterToChain('devnet')).toBe('solana:devnet');
  });

  it('maps mainnet and mainnet-beta → solana:mainnet', () => {
    expect(clusterToChain('mainnet')).toBe('solana:mainnet');
    expect(clusterToChain('mainnet-beta')).toBe('solana:mainnet');
  });

  it('maps testnet → solana:testnet', () => {
    expect(clusterToChain('testnet')).toBe('solana:testnet');
  });

  it('maps localnet → solana:localnet', () => {
    expect(clusterToChain('localnet')).toBe('solana:localnet');
  });

  it('throws on an unknown cluster (no silent wrong-cluster default)', () => {
    expect(() => clusterToChain('bogus')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// makeChainAwareSign — builds a sign wrapper that talks to the connected
// wallet's wallet-standard SolanaSignTransaction feature directly so it can
// pass `chain`. The bare adapter.signTransaction omits chain (Phantom then
// previews on its default mainnet-beta), which is the bug this fixes.
// ---------------------------------------------------------------------------

const ACCOUNT_PUBKEY = new PublicKey(new Uint8Array(32).fill(7));

/** A mock wallet-standard adapter exposing the SolanaSignTransaction feature. */
function mockStandardAdapter(opts?: { signImpl?: ReturnType<typeof vi.fn> }) {
  const account = {
    address: ACCOUNT_PUBKEY.toBase58(),
    publicKey: ACCOUNT_PUBKEY.toBytes(),
    chains: ['solana:devnet', 'solana:mainnet'] as const,
    features: [SolanaSignTransaction] as const,
  };
  // The feature returns the (round-tripped) serialized tx untouched — the
  // wrapper only needs to re-deserialize it, the bytes don't have to be
  // re-signed for this unit test.
  const signImpl =
    opts?.signImpl ??
    vi.fn(async (input: { transaction: Uint8Array }) => [{ signedTransaction: input.transaction }]);
  const wallet = {
    version: '1.0.0' as const,
    name: 'MockPhantom',
    icon: 'data:image/png;base64,AAAA' as const,
    chains: ['solana:devnet', 'solana:mainnet'] as const,
    accounts: [account],
    features: {
      [SolanaSignTransaction]: {
        version: '1.0.0' as const,
        supportedTransactionVersions: ['legacy', 0] as const,
        signTransaction: signImpl,
      },
    },
  };
  return {
    adapter: { standard: true as const, publicKey: ACCOUNT_PUBKEY, wallet },
    account,
    signImpl,
  };
}

function legacyTx(): Transaction {
  const tx = new Transaction();
  tx.feePayer = ACCOUNT_PUBKEY;
  tx.recentBlockhash = '11111111111111111111111111111111';
  return tx;
}

function v0Tx(): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey: ACCOUNT_PUBKEY,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

describe('makeChainAwareSign', () => {
  it('forwards chain to the wallet-standard SolanaSignTransaction feature (legacy tx)', async () => {
    const { adapter, account, signImpl } = mockStandardAdapter();
    const fallback = vi.fn();
    const sign = makeChainAwareSign(adapter as never, fallback, 'solana:devnet');

    await sign(legacyTx());

    expect(fallback).not.toHaveBeenCalled();
    expect(signImpl).toHaveBeenCalledTimes(1);
    const input = signImpl.mock.calls[0][0];
    expect(input.chain).toBe('solana:devnet');
    expect(input.account).toBe(account);
    expect(input.transaction).toBeInstanceOf(Uint8Array);
  });

  it('forwards chain for a v0 VersionedTransaction too', async () => {
    const { adapter, signImpl } = mockStandardAdapter();
    const sign = makeChainAwareSign(adapter as never, vi.fn(), 'solana:mainnet');

    const out = await sign(v0Tx());

    expect(signImpl).toHaveBeenCalledTimes(1);
    expect(signImpl.mock.calls[0][0].chain).toBe('solana:mainnet');
    expect(out).toBeInstanceOf(VersionedTransaction);
  });

  it('returns the deserialized signed transaction from the feature', async () => {
    const { adapter } = mockStandardAdapter();
    const sign = makeChainAwareSign(adapter as never, vi.fn(), 'solana:devnet');
    const out = await sign(legacyTx());
    expect(out).toBeInstanceOf(Transaction);
  });

  it('falls back to the bare signTransaction when the wallet is not a standard wallet', async () => {
    const signed = legacyTx();
    const fallback = vi.fn(async () => signed) as unknown as BareSign;
    // A non-standard adapter: no `standard`/`wallet` accessors.
    const adapter = { publicKey: ACCOUNT_PUBKEY };
    const sign = makeChainAwareSign(adapter as never, fallback, 'solana:devnet');

    const out = await sign(legacyTx());

    expect(fallback).toHaveBeenCalledTimes(1);
    expect(out).toBe(signed);
  });

  it('falls back when the standard wallet lacks the SolanaSignTransaction feature', async () => {
    const fallback = vi.fn(async (tx) => tx) as unknown as BareSign;
    const adapter = {
      standard: true,
      publicKey: ACCOUNT_PUBKEY,
      // wallet present but features map is empty (e.g. signAndSend-only wallet)
      wallet: { accounts: [{ publicKey: ACCOUNT_PUBKEY.toBytes(), features: [] }], features: {} },
    };
    const sign = makeChainAwareSign(adapter as never, fallback, 'solana:devnet');

    await sign(legacyTx());
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
