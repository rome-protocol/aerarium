// Compare the two discovery APIs for the SAME transfer_spl call:
//   A) rome_emulateCallAccounts  → emulator::eth_estimate_gas (truncates on revert)
//   B) rome_emulateTxWithPayer    → emulator::emulate()        (real execution)
// Goal: does B return a more COMPLETE / deterministic account set than A?
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { encodeFunctionData, serializeTransaction } from "viem";
import { loadChain } from "./_chain.mjs";

const { EVM, ASSET_ADDR, PROGRAM: PROGRAM_ID, CHAIN_ID } = loadChain();
const PROXY = "http://localhost:9090";          // discovery (#353 build, has both methods)
const PROGRAM = new PublicKey(PROGRAM_ID);
const SYNTH = "0x857534c27f4c0e8394921ad3b5b73cb4d7963633";
const WALLET = new PublicKey("9wJGNGWdFaotGrqBEuAkujhnRi94vyadDS4vz8YeiAds");
const HELPER = "0xff00000000000000000000000000000000000009";
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSETS = {
  wUSDC: ASSET_ADDR.wUSDC,
  wETH: ASSET_ADDR.wETH,
};
const TRANSFER_SPL = [{ type: "function", name: "transfer_spl", stateMutability: "nonpayable", inputs: [{ name: "to_ata", type: "bytes32" }, { name: "tokens", type: "uint64" }, { name: "mint", type: "bytes32" }], outputs: [] }];
const b32 = (pk) => "0x" + Buffer.from(pk.toBytes()).toString("hex");

async function rpc(url, method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return r.json();
}
async function ethCall(to, data) { return (await rpc(EVM, "eth_call", [{ to, data }, "latest"])).result; }

const synthPda = PublicKey.findProgramAddressSync([Buffer.from("EXTERNAL_AUTHORITY"), Buffer.from(SYNTH.slice(2), "hex")], PROGRAM)[0];
console.log("synthetic PDA:", synthPda.toBase58());

for (const [sym, wrapper] of Object.entries(ASSETS)) {
  const mintIdAbi = [{ type: "function", name: "mint_id", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] }];
  const r = await ethCall(wrapper, encodeFunctionData({ abi: mintIdAbi, functionName: "mint_id" }));
  if (!r || r === "0x") { console.log(`\n${sym}: could not read mint_id() → ${r}`); continue; }
  const mint = new PublicKey(Buffer.from(r.slice(2), "hex"));
  const srcAta = getAssociatedTokenAddressSync(mint, synthPda, true, TOKEN);
  const dstAta = getAssociatedTokenAddressSync(mint, WALLET, false, TOKEN);
  const data = encodeFunctionData({ abi: TRANSFER_SPL, functionName: "transfer_spl", args: [b32(dstAta), 1000n, b32(mint)] });

  const nonce = parseInt((await rpc(EVM, "eth_getTransactionCount", [SYNTH, "latest"])).result, 16);
  const gp = (await rpc(EVM, "eth_gasPrice", [])).result || "0x1";
  const rlp = serializeTransaction({ type: "eip1559", chainId: CHAIN_ID, nonce, maxFeePerGas: BigInt(gp), maxPriorityFeePerGas: BigInt(gp), gas: 2000000n, to: HELPER, value: 0n, data, accessList: [] });
  const unsignedRlp = "0x" + rlp.slice(4);

  const A = await rpc(PROXY, "rome_emulateCallAccounts", [{ from: SYNTH, to: HELPER, data }, WALLET.toBase58()]);
  const B = await rpc(PROXY, "rome_emulateTxWithPayer", [unsignedRlp, WALLET.toBase58()]);
  const setA = new Set((A.result || []).map((m) => m.pubkey));
  const setB = new Set((B.result || []).map((m) => m.pubkey));
  console.log(`\n=== ${sym}  src(synth)=${srcAta.toBase58().slice(0,8)}…  dst(wallet)=${dstAta.toBase58().slice(0,8)}… ===`);
  console.log(`  A eth_estimate_gas : ${A.error ? "ERR " + A.error.message : setA.size + " accts"}`);
  console.log(`  B emulate()        : ${B.error ? "ERR " + B.error.message : setB.size + " accts"}`);
  const has = (set, pk) => set.has(pk.toBase58()) ? "Y" : "·";
  console.log(`  src in A/B: ${has(setA, srcAta)}/${has(setB, srcAta)}   dst in A/B: ${has(setA, dstAta)}/${has(setB, dstAta)}   synthPDA in A/B: ${has(setA, synthPda)}/${has(setB, synthPda)}`);
}
