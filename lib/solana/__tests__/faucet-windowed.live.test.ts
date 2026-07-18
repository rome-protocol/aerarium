// LIVE proof: the windowed faucet (claimTokens) lets the Solana-native lane claim
// all 6 tokens in 2 sequential DoTxUnsigned windows, each UNDER Solana's 1.4M-CU
// cap — where the old atomic claim() over-runs at ~1.3996M. Drives the real lane
// primitives (emulateCallAccounts → ensureAlt → submitV0Instructions) against the
// NEW windowed faucet on Hadrian, signing with a funded local keypair (Phantom
// stand-in). Run:
//   GAMUT_FAUCET=0xfE18912e37D91FF8C8fFfb6ea2e1b212E43a78ff \
//   GAMUT_KEYPAIR=/tmp/gamut-fresh.json LIVE_FAUCET_WINDOW=1 \
//   npx vitest run lib/solana/__tests__/faucet-windowed.live.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createPublicClient, http, defineChain, encodeFunctionData, erc20Abi, type Hex, type PublicClient } from "viem";

import { syntheticAddress } from "@/lib/solana/identity";
import { submitV0Instructions, computeBudgetIxs } from "@/lib/solana/submit";
import { emulateCallAccounts } from "@/lib/solana/discovery";
import { ensureAlt } from "@/lib/solana/alt";
import { buildDoTxUnsigned } from "@/lib/solana/instructions";
import { buildUnsignedEip1559Rlp } from "@/lib/solana/unsignedTx";

const FAUCET = (process.env.GAMUT_FAUCET ?? "0xfE18912e37D91FF8C8fFfb6ea2e1b212E43a78ff") as Hex;
const PROXY = process.env.GAMUT_PROXY ?? "https://hadrian.testnet.romeprotocol.xyz/";
const ROME_RPC = process.env.GAMUT_ROME_RPC ?? "https://hadrian.testnet.romeprotocol.xyz/";
const SOLANA_RPC = process.env.GAMUT_SOLANA_RPC ?? "https://api.devnet.solana.com";
const CHAIN_ID = Number(process.env.GAMUT_CHAIN_ID ?? 200010);
const PROGRAM = new PublicKey(process.env.GAMUT_PROGRAM ?? "RPTWwELXAY4KC9ZPHhaxp7Sq1hHtU3HNEgLbSegCcWf");
const CU_CAP = 1_400_000;

const FAUCET_ABI = [
  { type: "function", name: "claimTokens", stateMutability: "nonpayable", inputs: [{ name: "start", type: "uint256" }, { name: "count", type: "uint256" }], outputs: [] },
  { type: "function", name: "tokenList", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
] as const;

describe.skipIf(!process.env.LIVE_FAUCET_WINDOW)("windowed faucet claim (2 DoTxUnsigned windows < 1.4M CU)", () => {
  // All env/file/network setup lives in beforeAll so describe.skipIf cleanly
  // skips this suite in CI — a top-level readFileSync(id.json) would throw
  // ENOENT at vitest COLLECTION time regardless of the skip (the describe
  // factory still runs). Matches altRegistry.live.test.ts.
  let kp!: Keypair;
  let synth!: Hex;
  let conn!: Connection;
  let sign!: (tx: Transaction) => Promise<Transaction>;
  let signV0!: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  let evm!: PublicClient;
  let tokens: Hex[] = [];

  beforeAll(async () => {
    kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.GAMUT_KEYPAIR ?? homedir() + "/.config/solana/id.json", "utf8"))));
    synth = syntheticAddress(kp.publicKey);
    conn = new Connection(SOLANA_RPC, "confirmed");
    sign = async (tx: Transaction) => { tx.sign(kp); return tx; };
    signV0 = async (tx: VersionedTransaction) => { tx.sign([kp]); return tx; };
    evm = createPublicClient({ chain: defineChain({ id: CHAIN_ID, name: "Rome", nativeCurrency: { name: "gas", symbol: "GAS", decimals: 18 }, rpcUrls: { default: { http: [ROME_RPC] } } }), transport: http(ROME_RPC, { timeout: 30_000 }) });
    tokens = (await evm.readContract({ address: FAUCET, abi: FAUCET_ABI, functionName: "tokenList" })) as Hex[];
    console.log(`\n  faucet=${FAUCET}  tokens=${tokens.length}\n  signer(sol)=${kp.publicKey.toBase58()}  synth=${synth}\n  proxy=${PROXY}\n`);
  });

  async function cuOf(sig: string): Promise<number> {
    const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 }).catch(() => null);
    return tx?.meta?.computeUnitsConsumed ?? -1;
  }

  // Mirrors useSolanaActions.submitOverAlt: discover → ensureAlt → v0 DoTxUnsigned.
  async function submitOverAlt(to: Hex, data: Hex): Promise<string> {
    const accounts = await emulateCallAccounts(PROXY, { from: synth, to, data }, kp.publicKey.toBase58());
    const alt = await ensureAlt(accounts.map((a) => a.pubkey), { connection: conn, payer: kp.publicKey, signTransaction: sign }, `${synth}-${FAUCET}`);
    const gasPrice = await evm.getGasPrice();
    const nonce = await evm.getTransactionCount({ address: synth });
    const ix = buildDoTxUnsigned({ programId: PROGRAM, unsignedRlp: buildUnsignedEip1559Rlp({ chainId: CHAIN_ID, nonce: BigInt(nonce), maxFeePerGas: gasPrice, maxPriorityFeePerGas: gasPrice, gasLimit: 2_000_000n, to, data }), accounts });
    const { signature } = await submitV0Instructions([...computeBudgetIxs(CU_CAP), ix], [alt], { connection: conn, feePayer: kp.publicKey, signTransaction: signV0 });
    return signature;
  }

  it("claims all 6 tokens in windows of GAMUT_WINDOW (default 2), each under 1.4M CU", async () => {
    const WINDOW = Number(process.env.GAMUT_WINDOW ?? 2);
    const n = tokens.length;
    let maxCu = 0;
    for (let start = 0; start < n; start += WINDOW) {
      const count = Math.min(WINDOW, n - start);
      const sig = await submitOverAlt(FAUCET, encodeFunctionData({ abi: FAUCET_ABI, functionName: "claimTokens", args: [BigInt(start), BigInt(count)] }));
      const cu = await cuOf(sig);
      maxCu = Math.max(maxCu, cu);
      console.log(`  ✔ claimTokens(${start},${count})  sig=${sig}  CU=${cu}`);
      expect(cu, `window @${start} landed`).toBeGreaterThan(0);
      expect(cu, `window @${start} under 1.4M`).toBeLessThan(CU_CAP);
    }
    console.log(`  → window size ${WINDOW}: ${Math.ceil(n / WINDOW)} txs, max CU/window = ${maxCu}`);

    // All 6 tokens claimed (synthetic balance > 0).
    for (const t of tokens) {
      const bal = (await evm.readContract({ address: t, abi: erc20Abi, functionName: "balanceOf", args: [synth] }).catch(() => 0n)) as bigint;
      console.log(`    ${t} synth balance = ${bal}`);
      expect(bal, `claimed ${t}`).toBeGreaterThan(0n);
    }
  }, 600_000);
});
