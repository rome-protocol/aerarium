// Diff the discovered account set for transfer_spl when the dest ATA EXISTS vs
// when it's FRESH (missing). The set-difference is exactly what the proxy's
// dst-missing branch still fails to restore (the on-chain "account not found"
// culprit). Probes the local :9090 proxy.
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { encodeFunctionData } from "viem";
import { loadChain } from "./_chain.mjs";

const { EVM, SOLANA, ASSET_ADDR, PROGRAM: PROGRAM_ID } = loadChain();
const PROXY = "http://localhost:9090";
const PROGRAM = new PublicKey(PROGRAM_ID);
const SYNTH = "0x857534c27f4c0e8394921ad3b5b73cb4d7963633";
const WALLET = new PublicKey("9wJGNGWdFaotGrqBEuAkujhnRi94vyadDS4vz8YeiAds");
const HELPER = "0xff00000000000000000000000000000000000009";
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROG = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SYS = new PublicKey("11111111111111111111111111111111");
const wUSDC = ASSET_ADDR.wUSDC;
const TRANSFER_SPL = [{ type: "function", name: "transfer_spl", stateMutability: "nonpayable", inputs: [{ name: "to_ata", type: "bytes32" }, { name: "tokens", type: "uint64" }, { name: "mint", type: "bytes32" }], outputs: [] }];
const MINT_ID = [{ type: "function", name: "mint_id", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] }];
const b32 = (pk) => "0x" + Buffer.from(pk.toBytes()).toString("hex");
const rpc = async (u, m, p) => (await (await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) })).json());
const disc = async (to, data) => { const r = await rpc(PROXY, "rome_emulateCallAccounts", [{ from: SYNTH, to, data }, WALLET.toBase58()]); if (r.error) throw new Error(r.error.message); return (r.result || []).map((m) => m.pubkey); };

const conn = new Connection(SOLANA, "confirmed");
const mint = new PublicKey(Buffer.from((await rpc(EVM, "eth_call", [{ to: wUSDC, data: encodeFunctionData({ abi: MINT_ID, functionName: "mint_id" }) }, "latest"])).result.slice(2), "hex"));
const synthPda = PublicKey.findProgramAddressSync([Buffer.from("EXTERNAL_AUTHORITY"), Buffer.from(SYNTH.slice(2), "hex")], PROGRAM)[0];

const label = (pk) => {
  if (pk === TOKEN.toBase58()) return "← SPL TOKEN PROGRAM";
  if (pk === ATA_PROG.toBase58()) return "← ATA PROGRAM";
  if (pk === SYS.toBase58()) return "← System";
  if (pk === mint.toBase58()) return "← MINT";
  if (pk === synthPda.toBase58()) return "← synthPda";
  if (pk === PROGRAM.toBase58()) return "← rome-evm program";
  return "";
};

const walletAta = getAssociatedTokenAddressSync(mint, WALLET, false, TOKEN);
const dataExists = encodeFunctionData({ abi: TRANSFER_SPL, functionName: "transfer_spl", args: [b32(walletAta), 1000n, b32(mint)] });
const existsSet = await disc(HELPER, dataExists);

const fresh = Keypair.generate().publicKey;
const freshAta = getAssociatedTokenAddressSync(mint, fresh, false, TOKEN);
const dataFresh = encodeFunctionData({ abi: TRANSFER_SPL, functionName: "transfer_spl", args: [b32(freshAta), 1000n, b32(mint)] });
const freshSet = await disc(HELPER, dataFresh);

console.log(`dst EXISTS → ${existsSet.length} accts:`);
for (const p of existsSet) console.log(`  ${p}  ${label(p)}`);
console.log(`\ndst FRESH → ${freshSet.length} accts:`);
for (const p of freshSet) console.log(`  ${p}  ${label(p)}`);

const missing = existsSet.filter((p) => !freshSet.includes(p));
console.log(`\nIN exists BUT NOT in fresh (what the dst-missing branch must ALSO restore):`);
for (const p of missing) console.log(`  ${p}  ${label(p)}`);
if (!missing.length) console.log("  (none — sets are complete)");
