// READ-ONLY discovery: for each flow call, what does rome_emulateCallAccounts
// (eth_estimate_gas, from=synthetic) return — and which of the 4 hardcodes does
// the client add today actually need to be added? Probes the LOCAL #353-method
// proxy on :9090. Treasure/balance are APPENDED by the method (always present);
// the genuine measurement is the transfer_spl ATAs (NOT appended) + truncation.
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { encodeFunctionData } from "viem";
import { loadChain } from "./_chain.mjs";

const { EVM, SOLANA, COMET, ASSET_ADDR, PROGRAM: PROGRAM_ID, CHAIN_ID: CHAIN } = loadChain();
const PROXY = "http://localhost:9090";
const PROGRAM = new PublicKey(PROGRAM_ID);
const SYNTH = "0x857534c27f4c0e8394921ad3b5b73cb4d7963633";
const WALLET = new PublicKey("9wJGNGWdFaotGrqBEuAkujhnRi94vyadDS4vz8YeiAds");
const HELPER = "0xff00000000000000000000000000000000000009";
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSETS = { wUSDC: ASSET_ADDR.wUSDC, wETH: ASSET_ADDR.wETH };

const b32 = (pk) => "0x" + Buffer.from(pk.toBytes()).toString("hex");
const u64le = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const addrBytes = (hex) => Buffer.from(hex.slice(2), "hex");

const treasure = PublicKey.findProgramAddressSync([u64le(CHAIN), Buffer.from("TREASURE_SEED"), u64le(0)], PROGRAM)[0];
const balanceKey = PublicKey.findProgramAddressSync([u64le(CHAIN), Buffer.from("ACCOUN_SEED"), addrBytes(SYNTH)], PROGRAM)[0];
const synthPda = PublicKey.findProgramAddressSync([Buffer.from("EXTERNAL_AUTHORITY"), addrBytes(SYNTH)], PROGRAM)[0];

async function rpc(url, method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return r.json();
}
const TRANSFER_SPL = [{ type: "function", name: "transfer_spl", stateMutability: "nonpayable", inputs: [{ name: "to_ata", type: "bytes32" }, { name: "tokens", type: "uint64" }, { name: "mint", type: "bytes32" }], outputs: [] }];
const APPROVE = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool" }] }];
const SUPPLY = [{ type: "function", name: "supply", stateMutability: "nonpayable", inputs: [{ name: "a", type: "address" }, { name: "amt", type: "uint256" }], outputs: [] }];
const WITHDRAW = [{ type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "a", type: "address" }, { name: "amt", type: "uint256" }], outputs: [] }];
const MINT_ID = [{ type: "function", name: "mint_id", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] }];

async function callAccounts(to, data) {
  const r = await rpc(PROXY, "rome_emulateCallAccounts", [{ from: SYNTH, to, data }, WALLET.toBase58()]);
  if (r.error) return { err: r.error.message };
  return { set: new Set((r.result || []).map((m) => m.pubkey)), n: (r.result || []).length };
}
const mark = (set, pk) => set && set.has(pk.toBase58()) ? "Y" : "·";

const conn = new Connection(SOLANA, "confirmed");
console.log(`synthPda=${synthPda.toBase58().slice(0,8)}…  treasure=${treasure.toBase58().slice(0,8)}…  balanceKey=${balanceKey.toBase58().slice(0,8)}…`);
console.log(`(treasure+balanceKey are APPENDED by the method → always Y; transfer_spl src/dst ATAs are NOT appended → Y means eth_estimate_gas surfaced them natively)\n`);

// ---- comet calls (approve / supply / withdraw) — shape check + base account set ----
const wusdc = ASSETS.wUSDC;
for (const [name, abi, fn, args] of [
  ["approve(comet)", APPROVE, "approve", [COMET, 1000000n]],
  ["supply(wUSDC)", SUPPLY, "supply", [wusdc, 1000000n]],
  ["withdraw(wUSDC)", WITHDRAW, "withdraw", [wusdc, 1000000n]],
]) {
  const data = encodeFunctionData({ abi, functionName: fn, args });
  const to = name.startsWith("approve") ? wusdc : COMET;
  const { set, n, err } = await callAccounts(to, data);
  console.log(`${name.padEnd(16)} → ${err ? "ERR " + err : `${n} accts  treasure=${mark(set,treasure)} balance=${mark(set,balanceKey)}`}`);
}

// ---- transfer_spl (the return leg): measure src(synthAta)/dst(walletAta) native presence + truncation ----
console.log("");
for (const [sym, wrapper] of Object.entries(ASSETS)) {
  const r = await rpc(EVM, "eth_call", [{ to: wrapper, data: encodeFunctionData({ abi: MINT_ID, functionName: "mint_id" }) }, "latest"]);
  if (!r.result || r.result === "0x") { console.log(`${sym}: mint_id unreadable`); continue; }
  const mint = new PublicKey(Buffer.from(r.result.slice(2), "hex"));
  const synthAta = getAssociatedTokenAddressSync(mint, synthPda, true, TOKEN);
  const walletAta = getAssociatedTokenAddressSync(mint, WALLET, false, TOKEN);
  const dstExists = !!(await conn.getAccountInfo(walletAta));
  const data = encodeFunctionData({ abi: TRANSFER_SPL, functionName: "transfer_spl", args: [b32(walletAta), 1000n, b32(mint)] });
  const { set, n, err } = await callAccounts(HELPER, data);
  console.log(`transfer_spl ${sym.padEnd(5)} dstWalletAta ${dstExists ? "EXISTS " : "MISSING"} → ${err ? "ERR " + err : `${n} accts  src(synthAta)=${mark(set,synthAta)} dst(walletAta)=${mark(set,walletAta)} synthPda=${mark(set,synthPda)} treasure=${mark(set,treasure)}`}`);
}

// ---- truncation boundary: transfer_spl to a GUARANTEED-MISSING dest ATA ----
console.log("");
{
  const r = await rpc(EVM, "eth_call", [{ to: ASSETS.wUSDC, data: encodeFunctionData({ abi: MINT_ID, functionName: "mint_id" }) }, "latest"]);
  const mint = new PublicKey(Buffer.from(r.result.slice(2), "hex"));
  const synthAta = getAssociatedTokenAddressSync(mint, synthPda, true, TOKEN);
  const freshOwner = Keypair.generate().publicKey; // never funded → its ATA does NOT exist
  const missingAta = getAssociatedTokenAddressSync(mint, freshOwner, false, TOKEN);
  const exists = !!(await conn.getAccountInfo(missingAta));
  const data = encodeFunctionData({ abi: TRANSFER_SPL, functionName: "transfer_spl", args: [b32(missingAta), 1000n, b32(mint)] });
  const { set, n, err } = await callAccounts(HELPER, data);
  console.log(`transfer_spl wUSDC dst=FRESH (exists=${exists}) → ${err ? "ERR " + err : `${n} accts  src(synthAta)=${mark(set,synthAta)} dst(missingAta)=${mark(set,missingAta)} synthPda=${mark(set,synthPda)}`}`);
  console.log(`  (compare to dstWalletAta EXISTS = 13 accts: if this is fewer / src dropped → TRUNCATION on dest-missing confirmed)`);
}
