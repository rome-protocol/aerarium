// Live end-to-end check of the deployed alt-registry program on the Rome devnet
// cluster: set_alt (create) + set_alt (overwrite), signed by the local deployer
// as authority, read back + decoded from chain.
//
// Confirms over HTTP getSignatureStatuses polling — the Rome node has no public
// WebSocket (sendAndConfirmTransaction's WS path 405s), same pattern as
// lib/solana/alt.ts sendLegacy.
//
// Run from anywhere under the demo worktree (resolves @solana/web3.js from the
// app's node_modules):  node programs/alt-registry/scripts/live-set-alt.mjs
import {
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
const COMET_HEX = "0x771D2f213b4C23f70Fa884d441a405F41F51Ab50"; // demo comet

const cometBytes = Buffer.from(COMET_HEX.slice(2), "hex"); // 20 bytes
const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(homedir() + "/.config/solana/id.json", "utf8"))),
);
const conn = new Connection(RPC, "confirmed");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const [pointer, bump] = PublicKey.findProgramAddressSync(
  [Buffer.from("alt"), authority.publicKey.toBuffer(), cometBytes],
  PROGRAM_ID,
);

function setAltIx(alt) {
  const data = Buffer.concat([Buffer.from([0]), cometBytes, alt.toBuffer()]); // [tag=0]++comet++alt
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

async function sendHttp(ix) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction().add(ix);
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = blockhash;
  tx.sign(authority);
  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
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

async function setAndVerify(alt, label) {
  const sig = await sendHttp(setAltIx(alt));
  const info = await conn.getAccountInfo(pointer, "confirmed");
  if (!info) throw new Error(`[${label}] pointer not found after set_alt`);
  const storedAlt = new PublicKey(info.data.subarray(0, 32));
  const storedBump = info.data[32];
  const ok =
    storedAlt.equals(alt) && info.owner.equals(PROGRAM_ID) && info.data.length === 33;
  console.log(`[${label}] sig=${sig}`);
  console.log(`  owner=${info.owner.toBase58()} len=${info.data.length} bump=${storedBump}`);
  console.log(`  stored=${storedAlt.toBase58()} expected=${alt.toBase58()} MATCH=${ok}`);
  if (!ok) throw new Error(`[${label}] verify FAILED`);
}

console.log("program:", PROGRAM_ID.toBase58());
console.log("authority:", authority.publicKey.toBase58());
console.log("pointer PDA:", pointer.toBase58(), "bump:", bump, "\n");

const alt1 = new PublicKey("HM6yueP8mWbDuWebg7QuyRU4W7nf9jph1Mk7xmvpUixb"); // real 39-key ALT
const alt2 = new PublicKey("9yV65GZJrgSK7mTYknFmBqc1Cy2KityTgH7Rh4HZswyb"); // real 19-key ALT
await setAndVerify(alt1, "create/repoint");
await setAndVerify(alt2, "overwrite");
console.log("\nLIVE OK: set_alt create + overwrite verified on-chain against the deployed program");
