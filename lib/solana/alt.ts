import {
  AddressLookupTableProgram,
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';

import { buildSetAltIx, readAltPointer } from './altRegistry';

/**
 * Address Lookup Table lifecycle for the Solana-native Compound lane.
 *
 * Heavy actions (borrow, liquidate) touch ~30+ accounts — over Solana's 28-key /
 * 1232-byte legacy-tx ceiling. An ALT lets those accounts be referenced by 1-byte
 * index in a v0 versioned tx instead of inline 32-byte keys.
 *
 * The ALT is a ONE-TIME, per-account (or per-app) artifact created alongside the
 * synthetic's PDA/ATA at activation — `activate: PDA → ATA → ALT`. Once it holds
 * the Comet's (shared) oracle/config accounts + the user's PDAs/ATAs, every later
 * borrow/liquidate just references it. Cached in localStorage so it's created
 * once and reused; extended if a later action needs keys it doesn't yet hold.
 */

export interface AltDeps {
  connection: Connection;
  payer: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

const CACHE_PREFIX = 'rome-disc-alt:';

function cached(cacheKey: string): string | null {
  try {
    return localStorage.getItem(CACHE_PREFIX + cacheKey);
  } catch {
    return null;
  }
}

async function sendLegacy(ixs: TransactionInstruction[], deps: AltDeps): Promise<void> {
  const { blockhash, lastValidBlockHeight } = await deps.connection.getLatestBlockhash();
  const tx = new Transaction();
  tx.feePayer = deps.payer;
  tx.recentBlockhash = blockhash;
  for (const ix of ixs) tx.add(ix);
  const signed = await deps.signTransaction(tx);
  const sig = await deps.connection.sendRawTransaction(signed.serialize());
  // confirm over HTTP (Rome node WS not guaranteed)
  for (;;) {
    const { value } = await deps.connection.getSignatureStatuses([sig]);
    const s = value[0];
    if (s?.err) throw new Error(`ALT tx failed: ${JSON.stringify(s.err)}`);
    if (s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized') return;
    if ((await deps.connection.getBlockHeight('confirmed')) > lastValidBlockHeight) {
      throw new Error('ALT tx not confirmed before blockhash expired');
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

/** Fetch an ALT account (active table) by address, or null if not yet resolvable. */
export async function fetchAlt(
  connection: Connection,
  address: PublicKey,
): Promise<AddressLookupTableAccount | null> {
  const res = await connection.getAddressLookupTable(address);
  return res.value;
}

/**
 * Ensure an ALT exists for `accounts` and return it (active, containing all of
 * them). Creates it (1 tx) + extends in chunks (N txs, ~20 keys each) if missing,
 * then waits for it to become active (~1 slot). Reuses the cached ALT if it
 * already covers every account; extends it if some are missing. `signTransaction`
 * (Phantom) signs each setup tx — the one-time activation cost.
 */
export async function ensureAlt(
  accounts: PublicKey[],
  deps: AltDeps,
  cacheKey: string,
  log?: (s: string) => void,
): Promise<AddressLookupTableAccount> {
  const want = [...new Set(accounts.map((a) => a.toBase58()))];
  const comet = parseCometFromCacheKey(cacheKey);

  // 1. localStorage fast-path (same device).
  const have = cached(cacheKey);
  if (have) {
    const reused = await reuseOrExtend(new PublicKey(have), want, deps, log);
    if (reused) return reused;
  }

  // 2. On-chain registry pointer (cross-device rediscovery — one getAccountInfo,
  //    no localStorage needed). Cache the resolved ALT for the fast-path next time.
  if (comet) {
    const pointed = await readAltPointer(deps.connection, deps.payer, comet);
    if (pointed) {
      const reused = await reuseOrExtend(pointed, want, deps, log);
      if (reused) {
        try {
          localStorage.setItem(CACHE_PREFIX + cacheKey, pointed.toBase58());
        } catch {}
        log?.(`ALT via registry pointer ${pointed.toBase58()}`);
        return reused;
      }
    }
  }

  // 3. Create a fresh ALT (recent slot required) + first extend, folding the
  //    set_alt registry write into the SAME tx (no extra popup). A smaller first
  //    chunk leaves room for the set_alt instruction within the 1232-byte limit.
  // recentSlot must already be present in the SlotHashes sysvar — back off a few
  // slots so createLookupTable doesn't reject a too-fresh slot (matches rome-sdk
  // AltTx's RECENT_SLOT_OFFSET; the bare current slot is intermittently ahead of
  // SlotHashes on the Rome cluster → "invalid instruction data").
  const slot = (await deps.connection.getSlot('confirmed')) - 10;
  const [createIx, altAddress] = AddressLookupTableProgram.createLookupTable({
    authority: deps.payer,
    payer: deps.payer,
    recentSlot: slot,
  });
  const firstN = comet ? 15 : 18;
  const first = want.slice(0, firstN).map((a) => new PublicKey(a));
  const ixs = [
    createIx,
    AddressLookupTableProgram.extendLookupTable({ lookupTable: altAddress, authority: deps.payer, payer: deps.payer, addresses: first }),
  ];
  if (comet) ixs.push(buildSetAltIx(deps.payer, comet, altAddress));
  log?.(`ALT create ${altAddress.toBase58()} + extend ${first.length}${comet ? ' + set_alt pointer' : ''} — sign ..`);
  await sendLegacy(ixs, deps);
  try {
    localStorage.setItem(CACHE_PREFIX + cacheKey, altAddress.toBase58());
  } catch {}
  // Extend with the remainder, chunked.
  const rest = want.slice(firstN).map((a) => new PublicKey(a));
  if (rest.length) await extend(altAddress, rest, deps, log);
  const active = await awaitActive(altAddress, deps);
  if (!active) throw new Error('ALT never became active');
  log?.(`ALT active ${altAddress.toBase58()} (${active.state.addresses.length} keys)`);
  return active;
}

/** Reuse an ALT at `addr` if it covers `want`; extend it if some keys are
 *  missing; return null if the table doesn't exist (caller falls through). */
async function reuseOrExtend(
  addr: PublicKey,
  want: string[],
  deps: AltDeps,
  log?: (s: string) => void,
): Promise<AddressLookupTableAccount | null> {
  const existing = await fetchAlt(deps.connection, addr);
  if (!existing) return null;
  const has = new Set(existing.state.addresses.map((a) => a.toBase58()));
  const missing = want.filter((a) => !has.has(a));
  if (missing.length === 0) {
    log?.(`ALT reused ${addr.toBase58()} (${existing.state.addresses.length} keys)`);
    return existing;
  }
  log?.(`ALT ${addr.toBase58()} missing ${missing.length} keys — extending ..`);
  await extend(addr, missing.map((a) => new PublicKey(a)), deps, log);
  return (await awaitActive(addr, deps))!;
}

/** The runActivate cacheKey is `${synthetic}-${comet}` (both 0x EVM addresses);
 *  recover the comet so we can derive/write the registry pointer. Returns null
 *  if the key isn't in that shape (registry path then no-ops). */
function parseCometFromCacheKey(cacheKey: string): string | null {
  const parts = cacheKey.split('-');
  const c = parts.length === 2 ? parts[1] : undefined;
  return c && /^0x[0-9a-fA-F]{40}$/.test(c) ? c : null;
}

async function extend(alt: PublicKey, accounts: PublicKey[], deps: AltDeps, log?: (s: string) => void): Promise<void> {
  for (let i = 0; i < accounts.length; i += 20) {
    const chunk = accounts.slice(i, i + 20);
    log?.(`ALT extend +${chunk.length} — sign ..`);
    await sendLegacy(
      [AddressLookupTableProgram.extendLookupTable({ lookupTable: alt, authority: deps.payer, payer: deps.payer, addresses: chunk })],
      deps,
    );
  }
}

/** An ALT is usable in a v0 tx one slot after the extend that added its keys. */
async function awaitActive(alt: PublicKey, deps: AltDeps): Promise<AddressLookupTableAccount | null> {
  for (let i = 0; i < 20; i++) {
    const acct = await fetchAlt(deps.connection, alt);
    if (acct && acct.state.addresses.length > 0) {
      await new Promise((r) => setTimeout(r, 600)); // let it warm one slot
      return (await fetchAlt(deps.connection, alt))!;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return null;
}
