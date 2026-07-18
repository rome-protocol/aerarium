import { describe, it, expect, vi } from "vitest";
import { PublicKey, type AddressLookupTableAccount } from "@solana/web3.js";

import { fetchPersistentAlts } from "../persistentAlts";

const COMET_ALT = "458nSqg6qzcsgYr1DiDrs59UBJD8VRsvpiiHP7rQ3MVk";
const CHAIN_ALT = "9DswaXsjcqozpbUUnL24wRqteqZTZH1UqCpFcsYWcgQP";

// A fake AddressLookupTableAccount stand-in keyed by its address — fetchPersistentAlts
// only ever passes the resolved table through to submitV0Instructions, so the
// shape under test is just "the account at this key, or null".
function fakeAlt(key: string): AddressLookupTableAccount {
  return { key: new PublicKey(key) } as unknown as AddressLookupTableAccount;
}

/** Minimal Connection double exposing getAddressLookupTable(pubkey) → {value}. */
function connStub(table: Record<string, AddressLookupTableAccount | null>) {
  return {
    getAddressLookupTable: vi.fn(async (pk: PublicKey) => ({
      value: table[pk.toBase58()] ?? null,
    })),
  };
}

describe("fetchPersistentAlts", () => {
  it("resolves each pubkey via getAddressLookupTable, in order", async () => {
    const conn = connStub({
      [COMET_ALT]: fakeAlt(COMET_ALT),
      [CHAIN_ALT]: fakeAlt(CHAIN_ALT),
    });
    const alts = await fetchPersistentAlts(conn as never, [COMET_ALT, CHAIN_ALT]);
    expect(alts.map((a) => a.key.toBase58())).toEqual([COMET_ALT, CHAIN_ALT]);
    expect(conn.getAddressLookupTable).toHaveBeenCalledTimes(2);
  });

  it("filters out pubkeys that don't resolve (null), keeping the rest", async () => {
    const conn = connStub({
      [COMET_ALT]: fakeAlt(COMET_ALT),
      [CHAIN_ALT]: null, // not yet built on-chain
    });
    const alts = await fetchPersistentAlts(conn as never, [COMET_ALT, CHAIN_ALT]);
    expect(alts.map((a) => a.key.toBase58())).toEqual([COMET_ALT]);
  });

  it("returns [] for an empty pubkey list without touching the connection", async () => {
    const conn = connStub({});
    const alts = await fetchPersistentAlts(conn as never, []);
    expect(alts).toEqual([]);
    expect(conn.getAddressLookupTable).not.toHaveBeenCalled();
  });

  it("ignores non-base58 / empty entries defensively", async () => {
    const conn = connStub({ [COMET_ALT]: fakeAlt(COMET_ALT) });
    const alts = await fetchPersistentAlts(conn as never, ["", COMET_ALT]);
    expect(alts.map((a) => a.key.toBase58())).toEqual([COMET_ALT]);
  });
});
