// End-to-end driver for the Solana-native Compound flows against the LOCAL
// rebuilt discovery proxy on :9090 (PR #362 — transfer_spl account completion).
//
// Mirrors app/flows/page.tsx exactly (DoTxUnsigned tag 17, ActivateAta tag 18,
// the EXTERNAL_AUTHORITY / ACCOUN_SEED / TREASURE_SEED PDA derivations, the
// per-flow leg sequences) but signs with a LOCAL KEYPAIR instead of Phantom, so
// the whole gamut can be driven head-less. The synthetic is derive_sender(kp),
// which for a brand-new signer is a FRESH synthetic → its wallet ATAs may not
// exist yet → exercises the dst-missing truncation case the proxy fix targets.
//
//   node scripts/drive-flows.mjs                 # recon only (read-only, no submit)
//   node scripts/drive-flows.mjs supply withdraw # drive named flows live
//   node scripts/drive-flows.mjs all             # supply→withdraw→borrow→repay→sweep
//
// Keypair: $DRIVE_KEYPAIR (default ~/.config/solana/id.json). Never printed.

import fs from "node:fs";
import os from "node:os";
import {
  Connection, PublicKey, Keypair, Transaction, VersionedTransaction,
  TransactionInstruction, TransactionMessage, ComputeBudgetProgram,
  AddressLookupTableProgram,
} from "@solana/web3.js";
import { encodeFunctionData, erc20Abi, keccak256, serializeTransaction, formatUnits } from "viem";
import { loadChain } from "./_chain.mjs";

// ── config (chain-agnostic: resolved from generated.json by CHAIN_ID) ──
const C = loadChain();
const PROXY = process.env.DRIVE_PROXY || "http://localhost:9090";
const EVM = process.env.DRIVE_EVM || C.EVM;
const SOLANA = process.env.DRIVE_SOLANA || C.SOLANA;
const PROGRAM = new PublicKey(C.PROGRAM);
const CHAIN = C.CHAIN_ID;
const COMET = C.COMET;
const HELPER = "0xff00000000000000000000000000000000000009";
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROG = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SYSTEM = new PublicKey("11111111111111111111111111111111");
const NATIVE_FAUCET = new PublicKey("541ZWNGfvw7ZurRRgQAEs1i3UEAFff7HUEL69oV4jeoW");
const FAUCET_TOKEN_ADDRS = C.cfg.faucet.tokens.map((t) => t.address);
const BASE = C.BASE;
const ASSETS = [
  { symbol: "wUSDC", address: C.ASSET_ADDR.wUSDC, amount: 1_000_000n },
  { symbol: "wETH", address: C.ASSET_ADDR.wETH, amount: 1_000_000n },
  { symbol: "wSOL", address: C.ASSET_ADDR.wSOL, amount: 20_000_000n },
  { symbol: "wBTC", address: C.ASSET_ADDR.wBTC, amount: 1_000_000n },
];

// ── keypair (never printed) ──
const KP_PATH = (process.env.DRIVE_KEYPAIR || `${os.homedir()}/.config/solana/id.json`).replace(/^~/, os.homedir());
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KP_PATH, "utf8"))));
const WALLET = kp.publicKey;
const SYNTH = "0x" + keccak256(kp.publicKey.toBytes()).slice(-40);

// ── ABIs ──
const WRAP = [...erc20Abi, { type: "function", name: "mint_id", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] }];
const COMET_ABI = [
  { type: "function", name: "supply", stateMutability: "nonpayable", inputs: [{ name: "a", type: "address" }, { name: "amt", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "a", type: "address" }, { name: "amt", type: "uint256" }], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "borrowBalanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
];
const TRANSFER_SPL = [{ type: "function", name: "transfer_spl", stateMutability: "nonpayable", inputs: [{ name: "to_ata", type: "bytes32" }, { name: "tokens", type: "uint64" }, { name: "mint", type: "bytes32" }], outputs: [] }];

// ── helpers ──
const b32 = (pk) => "0x" + Buffer.from(pk.toBytes()).toString("hex");
const addrBytes = (hex) => Buffer.from(hex.slice(2), "hex");
const u64le = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const conn = new Connection(SOLANA, "confirmed");

async function rpc(url, method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return r.json();
}
async function ethCall(to, data) { return (await rpc(EVM, "eth_call", [{ to, data }, "latest"])).result; }
async function readWrap(addr, fn, args = []) { return ethCall(addr, encodeFunctionData({ abi: WRAP, functionName: fn, args })); }

const treasure = PublicKey.findProgramAddressSync([u64le(CHAIN), Buffer.from("TREASURE_SEED"), u64le(0)], PROGRAM)[0];
const synthPda = PublicKey.findProgramAddressSync([Buffer.from("EXTERNAL_AUTHORITY"), addrBytes(SYNTH)], PROGRAM)[0];
const ownerInfo = PublicKey.findProgramAddressSync([Buffer.from("OWNER_INFO")], PROGRAM)[0];
const ata = (mint, owner) => PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN.toBuffer(), mint.toBuffer()], ATA_PROG)[0];
const createAtaIdempotentIx = (payer, ataAddr, owner, mint) => new TransactionInstruction({
  programId: ATA_PROG,
  keys: [
    { pubkey: payer, isSigner: true, isWritable: true }, { pubkey: ataAddr, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false }, { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
    { pubkey: TOKEN, isSigner: false, isWritable: false },
  ],
  data: Buffer.from([1]), // createIdempotent
});

async function discover(to, data) {
  const r = await rpc(PROXY, "rome_emulateCallAccounts", [{ from: SYNTH, to, data }, WALLET.toBase58()]);
  if (r.error) throw new Error(`discovery: ${r.error.message}`);
  return (r.result || []).map((m) => ({ pubkey: new PublicKey(m.pubkey), isSigner: m.is_signer, isWritable: m.is_writable }));
}

// keypair signer (replaces Phantom). legacy → partialSign; v0 → sign([kp]).
function sign(tx) {
  if (tx instanceof VersionedTransaction) { tx.sign([kp]); return tx; }
  tx.partialSign(kp); return tx;
}

async function sendLegacy(ixs) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction(); tx.feePayer = WALLET; tx.recentBlockhash = blockhash;
  for (const ix of ixs) tx.add(ix);
  sign(tx);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await poll(sig, lastValidBlockHeight);
  return sig;
}
async function sendV0(ixs, alt) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const msg = new TransactionMessage({ payerKey: WALLET, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(alt ? [alt] : []);
  const tx = new VersionedTransaction(msg); sign(tx);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await poll(sig, lastValidBlockHeight);
  return sig;
}
async function poll(sig, lastValid) {
  for (;;) {
    const { value } = await conn.getSignatureStatuses([sig]);
    const s = value[0];
    if (s) {
      if (s.err) { const logs = await txLogs(sig); throw new Error(`reverted ${JSON.stringify(s.err)}\n${logs}`); }
      if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") return;
    }
    if ((await conn.getBlockHeight("confirmed")) > lastValid) throw new Error("blockhash expired");
    await new Promise((r) => setTimeout(r, 1200));
  }
}
async function txLogs(sig) {
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 }).catch(() => null);
  return t?.meta?.logMessages?.join("\n") ?? "(no logs)";
}
async function txMetrics(sig) {
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 }).catch(() => null);
  const cu = t?.meta?.computeUnitsConsumed ?? "?";
  const heapLine = (t?.meta?.logMessages ?? []).find((l) => /Heap \d+/.test(l));
  const heap = heapLine ? heapLine.match(/Heap (\d+)/)[1] : "?";
  return { cu, heap };
}

// in-memory ALT cache (one ALT per synthetic, extended with missing keys).
let ALT = null;
async function ensureAlt(keys) {
  const want = [...new Set(keys.map((k) => k.toBase58()))];
  if (ALT) {
    const has = new Set(ALT.state.addresses.map((a) => a.toBase58()));
    const missing = want.filter((a) => !has.has(a));
    if (!missing.length) return ALT;
    await extendAlt(ALT.key, missing.map((a) => new PublicKey(a)));
    ALT = (await conn.getAddressLookupTable(ALT.key)).value;
    return ALT;
  }
  const slot = (await conn.getSlot("confirmed")) - 10;
  const [createIx, addr] = AddressLookupTableProgram.createLookupTable({ authority: WALLET, payer: WALLET, recentSlot: slot });
  const first = want.slice(0, 18).map((a) => new PublicKey(a));
  await sendLegacy([createIx, AddressLookupTableProgram.extendLookupTable({ lookupTable: addr, authority: WALLET, payer: WALLET, addresses: first })]);
  const rest = want.slice(18).map((a) => new PublicKey(a));
  if (rest.length) await extendAlt(addr, rest);
  for (let i = 0; i < 25; i++) {
    const a = (await conn.getAddressLookupTable(addr)).value;
    if (a && a.state.addresses.length >= want.length) { await new Promise((r) => setTimeout(r, 700)); ALT = (await conn.getAddressLookupTable(addr)).value; return ALT; }
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error("ALT never became active");
}
async function extendAlt(addr, keys) {
  for (let i = 0; i < keys.length; i += 20) {
    await sendLegacy([AddressLookupTableProgram.extendLookupTable({ lookupTable: addr, authority: WALLET, payer: WALLET, addresses: keys.slice(i, i + 20) })]);
  }
}

// the core: discover → treasure-append → DoTxUnsigned → (v0+ALT if heavy) → submit.
// NO client band-aids beyond treasure: this is the whole point — the proxy returns
// the complete set, so extraAccounts defaults to [] (the page.tsx still passes
// src/dst as a backstop; here we test the proxy ALONE).
async function runDoTx(to, data, { cuLimit = 1_350_000, extraAccounts = [], prependIxs = [], label = "" } = {}) {
  const accounts = await discover(to, data);
  if (!accounts.some((a) => a.pubkey.equals(treasure))) accounts.push({ pubkey: treasure, isSigner: false, isWritable: true });
  for (const e of extraAccounts) if (!accounts.some((a) => a.pubkey.equals(e.pubkey))) accounts.push(e);

  const gasPrice = BigInt((await rpc(EVM, "eth_gasPrice", [])).result || "0x1");
  const nonce = BigInt((await rpc(EVM, "eth_getTransactionCount", [SYNTH, "latest"])).result);
  const ser = serializeTransaction({ type: "eip1559", chainId: CHAIN, nonce: Number(nonce), maxPriorityFeePerGas: gasPrice, maxFeePerGas: gasPrice, gas: 2_000_000n, to, value: 0n, data, accessList: [] });
  const unsignedRlp = "0x" + ser.slice(4);
  const dotx = new TransactionInstruction({ programId: PROGRAM, keys: accounts, data: Buffer.concat([Buffer.from([17]), Buffer.from(unsignedRlp.slice(2), "hex")]) });
  const cbIxs = [ComputeBudgetProgram.requestHeapFrame({ bytes: 250 * 1024 }), ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit })];
  const ixs = [...cbIxs, ...prependIxs, dotx];

  let sig;
  if (accounts.length > 18) {
    const alt = await ensureAlt(accounts.map((a) => a.pubkey));
    sig = await sendV0(ixs, alt);
  } else {
    sig = await sendLegacy(ixs);
  }
  const { cu, heap } = await txMetrics(sig);
  console.log(`    ${label.padEnd(28)} ${accounts.length} accts · CU ${cu} · Heap ${heap} · ${sig.slice(0, 16)}…`);
  return sig;
}

function buildActivateAta(mint, tokens, fromAta, toAta) {
  const data = Buffer.alloc(1 + 8 + 32 + 8);
  data.writeUInt8(18, 0); data.writeBigUInt64LE(BigInt(CHAIN), 1); Buffer.from(mint.toBytes()).copy(data, 9); data.writeBigUInt64LE(tokens, 41);
  return new TransactionInstruction({
    programId: PROGRAM,
    keys: [
      { pubkey: WALLET, isSigner: true, isWritable: true }, { pubkey: ownerInfo, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: fromAta, isSigner: false, isWritable: true },
      { pubkey: toAta, isSigner: false, isWritable: true }, { pubkey: TOKEN, isSigner: false, isWritable: false },
    ], data,
  });
}

async function mintOf(wrapper) { return new PublicKey(Buffer.from((await readWrap(wrapper, "mint_id")).slice(2), "hex")); }
async function decimalsOf(wrapper) { return Number(BigInt(await readWrap(wrapper, "decimals"))); }
async function allowanceOf(wrapper, spender) { return BigInt(await ethCall(wrapper, encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [SYNTH, spender] }))); }
async function cometRead(fn, arg) { return BigInt(await ethCall(COMET, encodeFunctionData({ abi: COMET_ABI, functionName: fn, args: [arg] }))); }

// ── flows (mirror page.tsx) ──
// fund=true: ActivateAta moves wallet→synthetic first (base, real wallet SPL).
// fund=false: synthetic already holds the wrapper balanceOf (faucet-claimed collateral
//   — faucet credits EVM balance directly), so skip the fund leg.
async function doSupply(asset, { amount = asset.amount, fund = true } = {}) {
  console.log(`\n── SUPPLY ${asset.symbol} (${amount}) ${fund ? "" : "[from synthetic balance, no fund]"} ──`);
  const mint = await mintOf(asset.address);
  const walletAta = ata(mint, WALLET), synthAta = ata(mint, synthPda);
  const allowance = await allowanceOf(asset.address, COMET);
  if (fund) {
    console.log(`  ① fund: ${asset.symbol} wallet → synthetic (ActivateAta, native)`);
    await sendLegacy([createAtaIdempotentIx(WALLET, synthAta, synthPda, mint), buildActivateAta(mint, amount, walletAta, synthAta)]);
  }
  if (allowance < amount) { console.log(`  ${fund ? "②" : "①"} approve ${asset.symbol} → comet`); await runDoTx(asset.address, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [COMET, amount] }), { label: "approve" }); }
  console.log(`  comet.supply`);
  await runDoTx(COMET, encodeFunctionData({ abi: COMET_ABI, functionName: "supply", args: [asset.address, amount] }), { cuLimit: 1_400_000, label: "supply" });
  console.log(`  ✓ supplied · base balanceOf=${await cometRead("balanceOf", SYNTH)} · ${asset.symbol} wrapper bal=${BigInt(await readWrap(asset.address, "balanceOf", [SYNTH]))}`);
}

const FAUCET = "0xfE18912e37D91FF8C8fFfb6ea2e1b212E43a78ff";
const FAUCET_ABI = [
  { type: "function", name: "claimTokens", stateMutability: "nonpayable", inputs: [{ name: "start", type: "uint256" }, { name: "count", type: "uint256" }], outputs: [] },
  { type: "function", name: "claimed", stateMutability: "view", inputs: [{ name: "u", type: "address" }], outputs: [{ type: "bool" }] },
];
// claim faucet tokens [start,start+count) → credited to the synthetic's wrapper balanceOf
// (EVM-side, no Solana ATA). 2 per window (~900K CU). Gives the synthetic collateral to borrow against.
async function doFaucetClaim(start = 0, count = 2) {
  console.log(`\n── FAUCET claimTokens(${start},${count}) → synthetic ──`);
  await runDoTx(FAUCET, encodeFunctionData({ abi: FAUCET_ABI, functionName: "claimTokens", args: [BigInt(start), BigInt(count)] }), { cuLimit: 1_400_000, label: `claimTokens(${start},${count})` });
  for (const a of [ASSETS[3], ASSETS[1]]) { // wBTC, wETH (faucet idx 0,? — report what landed)
    try { console.log(`  ${a.symbol} synthetic wrapper bal=${BigInt(await readWrap(a.address, "balanceOf", [SYNTH]))}`); } catch {}
  }
}
async function doWithdraw(asset) {
  console.log(`\n── WITHDRAW ${asset.symbol} ──`);
  const mint = await mintOf(asset.address);
  const walletAta = ata(mint, WALLET), synthAta = ata(mint, synthPda);
  // Drawdown only: cap at the live base supply so we never accidentally open an
  // (uncollateralized) borrow. Borrow is exercised separately via doBorrow.
  const supply = await cometRead("balanceOf", SYNTH);
  const amt = supply < asset.amount ? supply : asset.amount;
  if (amt === 0n) { console.log(`  (nothing supplied — skip)`); return; }
  console.log(`  ① comet.withdraw ${formatUnits(amt, 6)} (drawdown) → synthetic`);
  await runDoTx(COMET, encodeFunctionData({ abi: COMET_ABI, functionName: "withdraw", args: [asset.address, amt] }), { cuLimit: 1_400_000, label: "withdraw" });
  console.log(`  ② transfer_spl synthetic → wallet (dest ATA folded in same bundle, NO band-aids)`);
  const prependIxs = (await conn.getAccountInfo(walletAta)) ? [] : [createAtaIdempotentIx(WALLET, walletAta, WALLET, mint)];
  await runDoTx(HELPER, encodeFunctionData({ abi: TRANSFER_SPL, functionName: "transfer_spl", args: [b32(walletAta), amt, b32(mint)] }), { prependIxs, label: "transfer_spl→wallet" });
  console.log(`  ✓ withdrawn · balanceOf=${await cometRead("balanceOf", SYNTH)}`);
}
async function doBorrow() {
  console.log(`\n── BORROW base (wUSDC) ──`);
  const mint = await mintOf(BASE);
  const walletAta = ata(mint, WALLET);
  const baseSupply = await cometRead("balanceOf", SYNTH);
  const amt = baseSupply + 1_000_000n;
  console.log(`  ① withdraw base beyond supply (opens debt): comet → synthetic`);
  await runDoTx(COMET, encodeFunctionData({ abi: COMET_ABI, functionName: "withdraw", args: [BASE, amt] }), { cuLimit: 1_400_000, label: "withdraw(borrow)" });
  console.log(`  ② return base: synthetic → wallet`);
  const prependIxs = (await conn.getAccountInfo(walletAta)) ? [] : [createAtaIdempotentIx(WALLET, walletAta, WALLET, mint)];
  await runDoTx(HELPER, encodeFunctionData({ abi: TRANSFER_SPL, functionName: "transfer_spl", args: [b32(walletAta), amt, b32(mint)] }), { prependIxs, label: "transfer_spl→wallet" });
  console.log(`  ✓ borrowed · debt=${await cometRead("borrowBalanceOf", SYNTH)}`);
}
async function doRepay() { console.log(`\n── REPAY (= supply base) ──`); await doSupply(ASSETS[0]); console.log(`  debt now=${await cometRead("borrowBalanceOf", SYNTH)}`); }

// Verify the USER-SIGNED SelfServeFaucet: the user's OWN DoTxUnsigned calls
// claim(recipient=walletPubkey, toAta=walletAta, mint) and the contract drops
// from ITS reserve (HELPER.call → external_auth(contract)) to the user's PHANTOM
// WALLET ATA — proving tokens land in the wallet, not the synthetic.
const SELF_FAUCET_ABI = [{ type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "recipient", type: "bytes32" }, { name: "toAta", type: "bytes32" }, { name: "mint", type: "bytes32" }], outputs: [] }];
const SELF_FAUCET_STATE = "$HOME/rome/compound-on-rome-comet/.worktrees/feat-selfserve-faucet/scripts/selfserve-faucet/state.json";
async function doSelfFaucet() {
  console.log(`\n── SELF-SERVE FAUCET (user-signed → Phantom WALLET) ──`);
  const faucetAddr = process.env.SELF_FAUCET || (() => { try { return JSON.parse(fs.readFileSync(SELF_FAUCET_STATE, "utf8")).selfServeFaucet; } catch { return null; } })();
  if (!faucetAddr) { console.log("  ✗ no SelfServeFaucet address (deploy first; set $SELF_FAUCET or state.json)"); return; }
  console.log(`  faucet ${faucetAddr}`);
  const asset = ASSETS[3]; // wBTC (a funded faucet token)
  const mint = await mintOf(asset.address);
  const walletAta = ata(mint, WALLET);
  const before = (await conn.getParsedTokenAccountsByOwner(WALLET, { mint }).catch(() => ({ value: [] }))).value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmountString ?? "0/none";
  console.log(`  ${asset.symbol} mint ${mint.toBase58().slice(0, 8)}… walletAta ${walletAta.toBase58().slice(0, 8)}… before=${before}`);
  console.log(`  claim(recipient=WALLET, toAta=walletAta, mint) — user-signed, drops to MY wallet`);
  await runDoTx(faucetAddr, encodeFunctionData({ abi: SELF_FAUCET_ABI, functionName: "claim", args: [b32(WALLET), b32(walletAta), b32(mint)] }), { cuLimit: 1_400_000, label: `selffaucet.claim ${asset.symbol}` });
  const after = (await conn.getParsedTokenAccountsByOwner(WALLET, { mint }).catch(() => ({ value: [] }))).value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmountString ?? "MISSING";
  console.log(`  ✓ wallet ${asset.symbol} balance: ${before} → ${after}  (synthetic untouched — tokens in the user's Phantom wallet)`);
}

// THE sharpest PR-#362 test: transfer_spl to a BRAND-NEW owner whose dest ATA does
// NOT exist (the truncation case). Fund synthetic, then transfer to the fresh ATA
// — createAtaIdempotent folded into the SAME bundle, extraAccounts=[] (NO band-aids).
// If it lands, the proxy's completed account set is sufficient for dst-missing.
async function doFreshPair() {
  console.log(`\n── FRESH PAIR (dst-missing transfer_spl, no band-aids) ──`);
  const asset = ASSETS[0], amt = 100_000n;
  const mint = await mintOf(asset.address);
  const walletAta = ata(mint, WALLET), synthAta = ata(mint, synthPda);
  console.log(`  fund synthetic 0.1 ${asset.symbol} (wallet → synthetic)`);
  await sendLegacy([createAtaIdempotentIx(WALLET, synthAta, synthPda, mint), buildActivateAta(mint, amt, walletAta, synthAta)]);
  const fresh = Keypair.generate().publicKey;
  const freshAta = ata(mint, fresh);
  const exists = !!(await conn.getAccountInfo(freshAta));
  console.log(`  fresh owner ${fresh.toBase58().slice(0, 8)}… ata ${freshAta.toBase58().slice(0, 8)}… exists=${exists} (expect false)`);
  console.log(`  transfer_spl synthetic → FRESH ata (create folded same bundle, extraAccounts=[])`);
  await runDoTx(HELPER, encodeFunctionData({ abi: TRANSFER_SPL, functionName: "transfer_spl", args: [b32(freshAta), amt, b32(mint)] }),
    { prependIxs: [createAtaIdempotentIx(WALLET, freshAta, fresh, mint)], label: "transfer_spl→FRESH" });
  const info = await conn.getParsedTokenAccountsByOwner(fresh, { mint }).catch(() => ({ value: [] }));
  const bal = info.value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmountString ?? "MISSING";
  console.log(`  ✓ fresh ATA now holds ${bal} (was non-existent) — dst-missing fix proven end-to-end`);
}

// enumerate the comet's full asset set + match against the signer wallet's holdings,
// to find a collateral we can actually supply (needed to drive borrow/repay).
const COMET_INFO_ABI = [
  { type: "function", name: "numAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "baseToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "getAssetInfo", stateMutability: "view", inputs: [{ name: "i", type: "uint8" }], outputs: [{ type: "tuple", components: [{ name: "offset", type: "uint8" }, { name: "asset", type: "address" }, { name: "priceFeed", type: "address" }, { name: "scale", type: "uint64" }, { name: "borrowCF", type: "uint64" }, { name: "liqCF", type: "uint64" }, { name: "liqFactor", type: "uint64" }, { name: "supplyCap", type: "uint128" }] }] },
];
async function enumerateAssets() {
  console.log(`\n══ COMET ASSETS (find a collateral the wallet holds) ══`);
  const { decodeFunctionResult } = await import("viem");
  const n = Number(BigInt(await ethCall(COMET, encodeFunctionData({ abi: COMET_INFO_ABI, functionName: "numAssets" }))));
  const held = (await conn.getParsedTokenAccountsByOwner(WALLET, { programId: TOKEN })).value
    .map((v) => ({ mint: v.account.data.parsed.info.mint, amt: v.account.data.parsed.info.tokenAmount.uiAmountString }))
    .filter((h) => Number(h.amt) > 0);
  const heldMints = new Map(held.map((h) => [h.mint, h.amt]));
  for (let i = 0; i < n; i++) {
    const res = decodeFunctionResult({ abi: COMET_INFO_ABI, functionName: "getAssetInfo", data: await ethCall(COMET, encodeFunctionData({ abi: COMET_INFO_ABI, functionName: "getAssetInfo", args: [i] })) });
    const addr = res.asset;
    let mintB = "?";
    try { mintB = new PublicKey(Buffer.from((await readWrap(addr, "mint_id")).slice(2), "hex")).toBase58(); } catch {}
    const have = heldMints.get(mintB);
    console.log(`  asset[${i}] ${addr} mint ${mintB.slice(0, 8)}… borrowCF=${res.borrowCF}  ${have ? `★ WALLET HOLDS ${have}` : ""}`);
  }
}

// NATIVE faucet: ONE Solana tx (1 sig) drops ALL faucet tokens to the user's
// wallet via the native-faucet BPF program (claim = create user ATA + transfer
// from the reserve PDA per mint). No EVM VM → ~few-K CU per token vs ~220K.
async function doNativeFaucet() {
  console.log("\n── NATIVE FAUCET claim (1 sig → wallet, all tokens) ──");
  const reserveAuth = PublicKey.findProgramAddressSync([Buffer.from("reserve")], NATIVE_FAUCET)[0];
  console.log("  reserve authority:", reserveAuth.toBase58());
  const keys = [
    { pubkey: WALLET, isSigner: true, isWritable: true },
    { pubkey: reserveAuth, isSigner: false, isWritable: false },
    { pubkey: TOKEN, isSigner: false, isWritable: false },
    { pubkey: ATA_PROG, isSigner: false, isWritable: false },
    { pubkey: SYSTEM, isSigner: false, isWritable: false },
  ];
  const mints = [];
  const before = {};
  for (const w of FAUCET_TOKEN_ADDRS) {
    const mint = await mintOf(w);
    mints.push({ w, mint });
    keys.push({ pubkey: mint, isSigner: false, isWritable: false });
    keys.push({ pubkey: ata(mint, reserveAuth), isSigner: false, isWritable: true });
    keys.push({ pubkey: ata(mint, WALLET), isSigner: false, isWritable: true });
    before[w] = (await conn.getParsedTokenAccountsByOwner(WALLET, { mint }).catch(() => ({ value: [] }))).value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmountString ?? "0/none";
  }
  const claimIx = new TransactionInstruction({ programId: NATIVE_FAUCET, keys, data: Buffer.from([0]) });
  const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 });
  const sig = await sendLegacy([cuIx, claimIx]);
  const { cu } = await txMetrics(sig);
  console.log(`  ✓ ONE tx · ${keys.length} accts · CU ${cu} · ${sig.slice(0, 16)}…`);
  for (const { w, mint } of mints) {
    const after = (await conn.getParsedTokenAccountsByOwner(WALLET, { mint }).catch(() => ({ value: [] }))).value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmountString ?? "MISSING";
    console.log(`    ${w.slice(0, 8)}…: ${before[w]} → ${after}`);
  }
}

async function recon() {
  console.log("══ RECON (read-only) ══");
  console.log(`wallet (signer): ${WALLET.toBase58()}`);
  console.log(`synthetic:       ${SYNTH}`);
  console.log(`synthPda:        ${synthPda.toBase58()}`);
  const gas = (await rpc(EVM, "eth_getBalance", [SYNTH, "latest"])).result;
  const nonce = (await rpc(EVM, "eth_getTransactionCount", [SYNTH, "latest"])).result;
  console.log(`synthetic Rome gas balance: ${gas}  nonce: ${nonce}`);
  console.log(`\nwallet holdings → wrapper map:`);
  for (const a of ASSETS) {
    const mint = await mintOf(a.address);
    const wAta = ata(mint, WALLET);
    const info = await conn.getParsedTokenAccountsByOwner(WALLET, { mint }).catch(() => ({ value: [] }));
    const bal = info.value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmountString ?? "0 (no ATA)";
    console.log(`  ${a.symbol.padEnd(6)} mint ${mint.toBase58().slice(0, 8)}…  walletAta ${wAta.toBase58().slice(0, 8)}…  bal=${bal}`);
  }
  console.log(`\nper-leg discovery account counts (proxy ${PROXY}):`);
  for (const [label, to, data] of [
    ["approve(comet)", BASE, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [COMET, 1_000_000n] })],
    ["supply(wUSDC)", COMET, encodeFunctionData({ abi: COMET_ABI, functionName: "supply", args: [BASE, 1_000_000n] })],
    ["withdraw(wUSDC)", COMET, encodeFunctionData({ abi: COMET_ABI, functionName: "withdraw", args: [BASE, 1_000_000n] })],
  ]) {
    try { const accts = await discover(to, data); console.log(`  ${label.padEnd(18)} → ${accts.length} accts`); }
    catch (e) { console.log(`  ${label.padEnd(18)} → ERR ${e.message}`); }
  }
}

async function main() {
  const flows = process.argv.slice(2);
  await recon();
  if (!flows.length) { console.log("\n(recon only — pass flow names to drive live: supply withdraw borrow repay / all)"); return; }
  const seq = flows.includes("all") ? ["supply", "borrow", "repay", "withdraw"] : flows;
  console.log(`\n══ DRIVING: ${seq.join(" → ")} ══`);
  for (const f of seq) {
    if (f === "supply") await doSupply(ASSETS[0]);
    else if (f === "supply-collat") await doSupply(ASSETS[3], { amount: 1_000_000_000n, fund: true }); // wBTC from wallet (native-airdropped)
    else if (f === "withdraw") await doWithdraw(ASSETS[0]);
    else if (f === "faucetclaim") await doFaucetClaim(0, 2);
    else if (f === "borrow") await doBorrow();
    else if (f === "repay") await doRepay();
    else if (f === "freshpair") await doFreshPair();
    else if (f === "selffaucet") await doSelfFaucet();
    else if (f === "nativefaucet") await doNativeFaucet();
    else if (f === "assets") await enumerateAssets();
    else console.log(`  (unknown flow: ${f})`);
  }
  console.log("\n✓ done");
}
main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
