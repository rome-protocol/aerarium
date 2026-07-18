import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

/**
 * Client for the on-chain ALT pointer registry (programs/alt-registry).
 *
 * The registry maps the deterministic `(authority, comet)` pair to the user's
 * Address Lookup Table address via a PDA `[b"alt", authority, comet]`. Because
 * the ALT's own address is `find_program_address([authority, recent_slot])`
 * (slot-dependent, un-rederivable), the pointer is how a returning user — on a
 * fresh browser / device, with no localStorage — rediscovers their ALT with a
 * single `getAccountInfo`.
 *
 * Account layout (33 bytes): `alt[32] ++ bump[1]`. Instruction data for set_alt:
 * `[tag=0] ++ comet[20] ++ alt[32]`.
 */

export const ALT_REGISTRY_PROGRAM = new PublicKey(
  process.env.NEXT_PUBLIC_ALT_REGISTRY_PROGRAM ??
    "2qQwRVKpVswDZQWawug5uybWwEdTYZJmdFvsGMjvPkfB",
);

const POINTER_SEED = Buffer.from("alt");
const SET_ALT_TAG = 0;

/** 0x-prefixed (or bare) 20-byte EVM comet address → 20 raw bytes. */
function cometBytes(comet: string): Buffer {
  const buf = Buffer.from(comet.replace(/^0x/, ""), "hex");
  if (buf.length !== 20) throw new Error(`comet must be 20 bytes, got ${buf.length}`);
  return buf;
}

/** Derive the pointer PDA for (authority, comet). Pure — no network. */
export function pointerPda(
  authority: PublicKey,
  comet: string,
  programId: PublicKey = ALT_REGISTRY_PROGRAM,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POINTER_SEED, authority.toBuffer(), cometBytes(comet)],
    programId,
  );
}

export interface AltPointer {
  alt: PublicKey;
  bump: number;
}

/** Decode a pointer account's 33-byte data: `alt[32] ++ bump[1]`. */
export function decodeAltPointer(data: Uint8Array): AltPointer {
  if (data.length < 33) throw new Error(`alt-pointer too short: ${data.length} bytes`);
  return { alt: new PublicKey(data.subarray(0, 32)), bump: data[32] };
}

/** Build the `set_alt(comet, alt)` instruction. Authority signs + pays rent. */
export function buildSetAltIx(
  authority: PublicKey,
  comet: string,
  alt: PublicKey,
  programId: PublicKey = ALT_REGISTRY_PROGRAM,
): TransactionInstruction {
  const [pointer] = pointerPda(authority, comet, programId);
  const data = Buffer.concat([Buffer.from([SET_ALT_TAG]), cometBytes(comet), alt.toBuffer()]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: pointer, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Read the ALT address an (authority, comet) maps to, or null if unset. A single
 * `getAccountInfo` on the derived PDA — works on the Rome node (no gPA scan).
 */
export async function readAltPointer(
  connection: Connection,
  authority: PublicKey,
  comet: string,
  programId: PublicKey = ALT_REGISTRY_PROGRAM,
): Promise<PublicKey | null> {
  const [pointer] = pointerPda(authority, comet, programId);
  const info = await connection.getAccountInfo(pointer, "confirmed");
  if (!info || !info.owner.equals(programId) || info.data.length < 33) return null;
  return decodeAltPointer(info.data).alt;
}
