import {
  Connection,
  PublicKey,
  type AddressLookupTableAccount,
} from "@solana/web3.js";

/**
 * Resolve the lane's PERSISTENT Address Lookup Tables (registry comet + chain
 * ALTs, from cfg.persistentAlts) into active AddressLookupTableAccounts for a v0
 * tx. These tables are operator-owned and shared across all users — created once
 * on-chain (separate op), never per-user — so the lane just fetches them and
 * hands them to submitV0Instructions; accounts not covered go inline.
 *
 * A pubkey that doesn't resolve yet (table not built on-chain) is filtered out
 * rather than throwing — the tx still assembles (more accounts land inline,
 * possibly overflowing the 1232-byte limit, which surfaces as a normal submit
 * error). Empty / non-base58 entries are skipped defensively.
 */
export async function fetchPersistentAlts(
  connection: Connection,
  pubkeys: string[],
): Promise<AddressLookupTableAccount[]> {
  const keys: PublicKey[] = [];
  for (const p of pubkeys) {
    if (!p) continue;
    try {
      keys.push(new PublicKey(p));
    } catch {
      // skip a malformed pubkey rather than failing the whole tx
    }
  }
  const resolved = await Promise.all(
    keys.map((key) => connection.getAddressLookupTable(key).then((r) => r.value)),
  );
  return resolved.filter((t): t is AddressLookupTableAccount => t != null);
}
