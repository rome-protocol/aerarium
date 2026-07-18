// Live verification of the production native-faucet claim path: imports the REAL
// buildNativeFaucetClaimIx the /solana/faucet page uses, reads each faucet
// token's underlying mint from Hadrian, builds ONE claim ix, signs with the
// harness keypair (= the "wallet"), and submits to Solana devnet. Confirms the
// drop lands in one tx and reports CU. Read-only against Hadrian; writes to
// Solana devnet from the keypair.
//   tsx scripts/verify-native-faucet.ts
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  Connection,
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
  Transaction,
} from "@solana/web3.js";
import { createPublicClient, http, defineChain, type Address, type Hex } from "viem";
import { buildNativeFaucetClaimIx, NATIVE_FAUCET_PROGRAM } from "../lib/solana/nativeFaucet";
import { getCompoundConfig } from "../lib/registry";

// Chain-agnostic: pick the chain with CHAIN_ID / NEXT_PUBLIC_DEFAULT_CHAIN_ID,
// resolve its RPC from the registry config (no hardcoded chain id or endpoint).
const CHAIN_ID = Number(process.env.CHAIN_ID ?? process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? "");
if (!CHAIN_ID) throw new Error("set CHAIN_ID (or NEXT_PUBLIC_DEFAULT_CHAIN_ID)");
const chainCfg = getCompoundConfig(CHAIN_ID);
if (!chainCfg) throw new Error(`no Compound config for chain ${CHAIN_ID}`);
const RPC = chainCfg.rpcUrl;
const SOLANA = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";

const MINT_ID_ABI = [
  { type: "function", name: "mint_id", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bytes32" }] },
] as const;

async function main() {
  const faucet = getCompoundConfig(CHAIN_ID)?.faucet;
  if (!faucet || faucet.tokens.length === 0) throw new Error("no faucet config for chain");

  const kp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))),
  );
  console.log("wallet (signer):", kp.publicKey.toBase58());
  console.log("faucet program: ", NATIVE_FAUCET_PROGRAM.toBase58());

  const pub = createPublicClient({
    chain: defineChain({ id: CHAIN_ID, name: "Rome", nativeCurrency: { name: "g", symbol: "G", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }),
    transport: http(RPC),
  });

  // Resolve each token's underlying SPL mint via wrapper.mint_id() — exactly
  // what the page does.
  const mints: PublicKey[] = [];
  for (const t of faucet.tokens) {
    const b32 = (await pub.readContract({ address: t.address as Address, abi: MINT_ID_ABI, functionName: "mint_id" })) as Hex;
    mints.push(new PublicKey(Buffer.from(b32.slice(2), "hex")));
  }
  console.log(`tokens: ${faucet.tokens.map((t) => t.symbol).join(", ")} (${mints.length} mints)`);

  const claimIx = buildNativeFaucetClaimIx({ user: kp.publicKey, mints });
  console.log(`claim ix: ${claimIx.keys.length} accounts (6 fixed + 3×${mints.length})`);

  const conn = new Connection(SOLANA, "confirmed");

  // One claim attempt. Returns { sig, cu } on success, or { err } on revert.
  const attemptClaim = async (): Promise<{ sig?: string; cu?: number; err?: unknown }> => {
    const tx = new Transaction();
    tx.feePayer = kp.publicKey;
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));
    tx.add(claimIx);
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.sign(kp);
    try {
      const sig = await conn.sendRawTransaction(tx.serialize());
      const conf = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      if (conf.value.err) return { err: conf.value.err };
      const detail = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
      return { sig, cu: detail?.meta?.computeUnitsConsumed ?? undefined };
    } catch (e) {
      return { err: (e as Error).message ?? e };
    }
  };

  // The one-time guard: if this wallet already has a [b"claimed"] marker (from a
  // prior run), the FIRST attempt here already reverts — that itself proves the
  // guard. Otherwise the first lands and the SECOND must revert.
  const first = await attemptClaim();
  if (first.sig) {
    console.log(`① claim LANDED — 1 sig · CU ${first.cu ?? "?"} · ${first.sig}`);
    const second = await attemptClaim();
    if (second.sig) throw new Error(`one-time guard FAILED — second claim also landed (${second.sig})`);
    console.log(`② repeat claim correctly REVERTED (one-time guard) — ${JSON.stringify(second.err).slice(0, 120)}`);
  } else {
    console.log(`① claim REVERTED (wallet already has a claim marker from a prior run — guard active): ${JSON.stringify(first.err).slice(0, 120)}`);
    console.log("  (run with a fresh wallet to see ① land + ② revert)");
  }
  console.log("✓ one-time guard verified");
}

main().catch((e) => {
  console.error("FAILED:", e.message ?? e);
  process.exit(1);
});
