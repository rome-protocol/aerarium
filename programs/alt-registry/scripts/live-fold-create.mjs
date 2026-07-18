// Verifies approach (a): the folded ALT-create tx that ensureAlt now builds —
// createLookupTable + extendLookupTable(15 keys) + set_alt — fits in one legacy
// tx, lands, and leaves BOTH a populated ALT and a registry pointer to it.
//
// Uses a fresh test comet (0xAA..) so it exercises the create-fresh path. Signed
// by the local deployer as the authority stand-in (Phantom signs in the app).
//
// node programs/alt-registry/scripts/live-fold-create.mjs
import {
  AddressLookupTableProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("2qQwRVKpVswDZQWawug5uybWwEdTYZJmdFvsGMjvPkfB");
const COMET_HEX = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // fresh test comet

const cometBytes = Buffer.from(COMET_HEX.slice(2), "hex");
const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(homedir() + "/.config/solana/id.json", "utf8"))),
);
const conn = new Connection(RPC, "confirmed");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setAltIx(alt) {
  const [pointer] = PublicKey.findProgramAddressSync(
    [Buffer.from("alt"), authority.publicKey.toBuffer(), cometBytes],
    PROGRAM_ID,
  );
  const data = Buffer.concat([Buffer.from([0]), cometBytes, alt.toBuffer()]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pointer, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function sendHttp(ixs) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction().add(...ixs);
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = blockhash;
  tx.sign(authority);
  const raw = tx.serialize();
  console.log(`tx size: ${raw.length} bytes (legacy limit 1232)`);
  const sig = await conn.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: "confirmed" });
  for (;;) {
    const { value } = await conn.getSignatureStatuses([sig]);
    const s = value[0];
    if (s?.err) throw new Error(`tx failed: ${JSON.stringify(s.err)}`);
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return sig;
    if ((await conn.getBlockHeight("confirmed")) > lastValidBlockHeight)
      throw new Error("blockhash expired before confirm");
    await sleep(1000);
  }
}

const slot = await conn.getSlot("confirmed");
const [createIx, altAddress] = AddressLookupTableProgram.createLookupTable({
  authority: authority.publicKey,
  payer: authority.publicKey,
  recentSlot: slot,
});
const keys15 = Array.from({ length: 15 }, () => Keypair.generate().publicKey);
const extendIx = AddressLookupTableProgram.extendLookupTable({
  lookupTable: altAddress,
  authority: authority.publicKey,
  payer: authority.publicKey,
  addresses: keys15,
});

console.log("new ALT:", altAddress.toBase58());
const sig = await sendHttp([createIx, extendIx, setAltIx(altAddress)]);
console.log("folded create+extend15+set_alt sig:", sig);

// 1. ALT exists with 15 addresses
await sleep(1200);
const alt = await conn.getAddressLookupTable(altAddress);
const altKeys = alt.value?.state.addresses.length ?? 0;
console.log(`ALT addresses: ${altKeys} (expect 15)`);

// 2. pointer points at the new ALT
const [pointer] = PublicKey.findProgramAddressSync(
  [Buffer.from("alt"), authority.publicKey.toBuffer(), cometBytes],
  PROGRAM_ID,
);
const info = await conn.getAccountInfo(pointer, "confirmed");
const storedAlt = info ? new PublicKey(info.data.subarray(0, 32)) : null;
const pointerOk = !!info && info.owner.equals(PROGRAM_ID) && storedAlt.equals(altAddress);
console.log(`pointer ${pointer.toBase58()} -> ${storedAlt?.toBase58()}  expect ${altAddress.toBase58()}  OK=${pointerOk}`);

if (altKeys !== 15 || !pointerOk) throw new Error("FOLDED-CREATE VERIFY FAILED");
console.log("\nLIVE OK (approach a): one tx created+populated the ALT AND wrote the registry pointer");
