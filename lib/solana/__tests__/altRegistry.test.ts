import { describe, it, expect } from "vitest";
import { PublicKey, SystemProgram } from "@solana/web3.js";

import {
  ALT_REGISTRY_PROGRAM,
  pointerPda,
  decodeAltPointer,
  buildSetAltIx,
} from "../altRegistry";

// Live on-chain fixture, verified against the deployed program
// 2qQwRVKpVswDZQWawug5uybWwEdTYZJmdFvsGMjvPkfB:
//   authority 55R4… + comet 0x771D2f21… -> pointer J9qXw…, bump 255.
const AUTHORITY = new PublicKey("55R41dbRU13QhLpAgha1841wR5M6sAcZhXd4S1LGupBn");
const COMET = "0x771D2f213b4C23f70Fa884d441a405F41F51Ab50";
const POINTER = "J9qXwqfPuG5vN2jDejAJrL1T1PGLGK18fZ1x7bnCCz9q";
const ALT = new PublicKey("HM6yueP8mWbDuWebg7QuyRU4W7nf9jph1Mk7xmvpUixb");

describe('pointerPda — deterministic [b"alt", authority, comet]', () => {
  it("matches the on-chain pointer PDA for the live fixture", () => {
    const [pda, bump] = pointerPda(AUTHORITY, COMET);
    expect(pda.toBase58()).toBe(POINTER);
    expect(bump).toBe(255);
  });
  it("is independent of the 0x prefix on comet", () => {
    expect(pointerPda(AUTHORITY, COMET)[0].toBase58()).toBe(
      pointerPda(AUTHORITY, COMET.slice(2))[0].toBase58(),
    );
  });
});

describe("decodeAltPointer — 33-byte account: alt[32] ++ bump[1]", () => {
  it("decodes alt + bump", () => {
    const data = new Uint8Array(33);
    data.set(ALT.toBytes(), 0);
    data[32] = 254;
    const decoded = decodeAltPointer(data);
    expect(decoded.alt.toBase58()).toBe(ALT.toBase58());
    expect(decoded.bump).toBe(254);
  });
  it("throws on a short buffer", () => {
    expect(() => decodeAltPointer(new Uint8Array(10))).toThrow();
  });
});

describe("buildSetAltIx — [tag=0] ++ comet(20) ++ alt(32), 3 accounts", () => {
  it("encodes the instruction data + account metas", () => {
    const ix = buildSetAltIx(AUTHORITY, COMET, ALT);
    expect(ix.programId.toBase58()).toBe(ALT_REGISTRY_PROGRAM.toBase58());
    expect(ix.data.length).toBe(53);
    expect(ix.data[0]).toBe(0);
    expect(Buffer.from(ix.data.subarray(1, 21)).toString("hex")).toBe(
      COMET.slice(2).toLowerCase(),
    );
    expect(Buffer.from(ix.data.subarray(21, 53))).toEqual(Buffer.from(ALT.toBytes()));

    const [pointer] = pointerPda(AUTHORITY, COMET);
    expect(ix.keys[0].pubkey.toBase58()).toBe(pointer.toBase58());
    expect(ix.keys[0].isWritable).toBe(true);
    expect(ix.keys[0].isSigner).toBe(false);
    expect(ix.keys[1].pubkey.toBase58()).toBe(AUTHORITY.toBase58());
    expect(ix.keys[1].isSigner).toBe(true);
    expect(ix.keys[1].isWritable).toBe(true);
    expect(ix.keys[2].pubkey.toBase58()).toBe(SystemProgram.programId.toBase58());
    expect(ix.keys[2].isSigner).toBe(false);
  });
});
