// =====================================================================
// AERARIUM — chain-aware Solana sign wrapper
//
// The Solana lane signs via @solana/wallet-adapter-react useWallet()
// signTransaction, then submits over its OWN Rome devnet connection (the
// custom DoTxUnsigned flow uses sign-then-own-submit, NOT the adapter's
// sendTransaction). The StandardWalletAdapter's bare `signTransaction` calls
// the wallet-standard SolanaSignTransaction feature with ONLY
// `{ account, transaction }` — it passes NO `chain`. (Its sendTransaction path
// DOES derive chain = getChainForEndpoint(connection.rpcEndpoint) and forward
// it, but the lane never takes that path.) Phantom's connect `cluster` defaults
// to mainnet-beta when unspecified, so with no chain on the sign request Phantom
// runs its transaction preview/simulation on mainnet-beta — where the devnet-only
// rome-evm program + persistent ALTs don't exist — and shows
// "Failed to simulate the results of this request." The txs are valid and LAND
// on submit; only Phantom's preview is on the wrong cluster.
//
// Fix: tell Phantom the cluster by passing the wallet-standard
// `chain: 'solana:<cluster>'` on every sign request, derived from the registry
// `solanaCluster`. makeChainAwareSign talks to the connected wallet's
// SolanaSignTransaction feature directly so it can include `chain`; it falls
// back to the bare adapter.signTransaction for non-standard wallets.
// =====================================================================
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { isVersionedTransaction } from '@solana/wallet-adapter-base';
import { SolanaSignTransaction } from '@solana/wallet-standard-features';
import type { Adapter } from '@solana/wallet-adapter-base';
import type { IdentifierString, WalletAccount } from '@wallet-standard/base';
import type {
  SolanaSignTransactionFeature,
  SolanaSignTransactionMethod,
} from '@solana/wallet-standard-features';

/**
 * Map the registry `solanaCluster` (chain.json #solana.cluster — the bare
 * cluster name, e.g. "devnet") to the wallet-standard chain identifier the
 * SolanaSignTransaction feature expects ("solana:<cluster>", matching
 * @solana/wallet-standard-chains SOLANA_*_CHAIN). Phantom uses this chain to
 * pick which cluster its transaction preview/simulation runs on.
 *
 * Generalizes across environments — a mainnet chain maps to 'solana:mainnet',
 * NOT a hardcoded devnet. "mainnet-beta" (Solana's full cluster name) and
 * "mainnet" both fold to 'solana:mainnet'. Throws on an unknown cluster rather
 * than silently defaulting, so a misconfigured registry surfaces loudly instead
 * of putting Phantom back on the wrong cluster.
 */
export function clusterToChain(cluster: string): IdentifierString {
  switch (cluster) {
    case 'mainnet':
    case 'mainnet-beta':
      return 'solana:mainnet';
    case 'devnet':
      return 'solana:devnet';
    case 'testnet':
      return 'solana:testnet';
    case 'localnet':
      return 'solana:localnet';
    default:
      throw new Error(`unknown Solana cluster "${cluster}" — cannot derive wallet-standard chain`);
  }
}

/** A standard wallet exposing the SolanaSignTransaction feature + its accounts. */
type StandardSignWallet = SolanaSignTransactionFeature & {
  accounts: readonly WalletAccount[];
};

/**
 * The wallet-adapter-react `useWallet().wallet?.adapter` is an `Adapter`; the
 * wallet-standard ones are StandardWalletAdapter, which exposes `standard` and a
 * `wallet` accessor for the underlying standard Wallet. Narrow to that shape
 * without importing the (transitively-nested) adapter package.
 */
type MaybeStandardAdapter = Adapter & {
  standard?: boolean;
  wallet?: { features: Record<string, unknown>; accounts: readonly WalletAccount[] };
};

function standardSignWallet(adapter: Adapter | null): StandardSignWallet | null {
  const a = adapter as MaybeStandardAdapter | null;
  const wallet = a?.standard ? a.wallet : undefined;
  if (!wallet) return null;
  const feature = wallet.features[SolanaSignTransaction] as
    | SolanaSignTransactionFeature[typeof SolanaSignTransaction]
    | undefined;
  if (!feature || typeof feature.signTransaction !== 'function') return null;
  return { [SolanaSignTransaction]: feature, accounts: wallet.accounts };
}

/** The bare `useWallet().signTransaction` (the wallet-adapter one, no chain). */
export type BareSign = <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;

/**
 * Build a sign function that forwards `chain` to the connected wallet's
 * wallet-standard SolanaSignTransaction feature, so Phantom previews on the
 * right cluster. Mirrors StandardWalletAdapter's own serialize/deserialize
 * (legacy: serialize with requireAllSignatures/verifySignatures false; v0:
 * VersionedTransaction.serialize) and just adds the `chain` input.
 *
 * If the wallet is not a wallet-standard wallet (or doesn't expose the feature),
 * it falls back to the bare adapter `signTransaction` — that path can't pass a
 * chain, but it preserves behavior for non-standard adapters rather than failing.
 */
export function makeChainAwareSign(
  adapter: Adapter | null,
  fallbackSign: BareSign,
  chain: IdentifierString,
): BareSign {
  const standard = standardSignWallet(adapter);
  if (!standard) return fallbackSign;

  // The connected account is the adapter's publicKey; match it in the standard
  // wallet's authorized accounts (fall back to the first, as the adapter does).
  const adapterPubkey = (adapter as MaybeStandardAdapter).publicKey;
  const account =
    (adapterPubkey &&
      standard.accounts.find((acc) => bytesEqual(acc.publicKey, adapterPubkey.toBytes()))) ||
    standard.accounts[0];

  const signTransaction: SolanaSignTransactionMethod =
    standard[SolanaSignTransaction].signTransaction;

  return async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
    if (!account) return fallbackSign(tx);
    const serialized = isVersionedTransaction(tx)
      ? tx.serialize()
      : new Uint8Array(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));

    const [output] = await signTransaction({ account, chain, transaction: serialized });
    const signed = output.signedTransaction;
    return (
      isVersionedTransaction(tx)
        ? VersionedTransaction.deserialize(signed)
        : Transaction.from(signed)
    ) as T;
  };
}

function bytesEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
