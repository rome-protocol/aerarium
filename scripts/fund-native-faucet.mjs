// Fund the native-faucet program's reserve. For each faucet token: create the
// reserve PDA's ATA, then transfer tokens into it — via the EVM deployer calling
// the HelperProgram (create_ata_for_key + transfer_spl), which moves SPL from
// external_auth(deployer). ETH_PK from env (never printed).
//
// Run: ETH_PK=$(jq -r .privateKey <your-deployer-key.json>) \
//        node scripts/fund-native-faucet.mjs
import { createPublicClient, createWalletClient, http, defineChain, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { loadChain } from "./_chain.mjs";

const { EVM, CHAIN_ID, cfg } = loadChain();
const HELPER = "0xff00000000000000000000000000000000000009";
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const NATIVE_FAUCET = new PublicKey("541ZWNGfvw7ZurRRgQAEs1i3UEAFff7HUEL69oV4jeoW");
const FUND = 200_000_000_000n; // 200 claims × 1.0 token (9 dec)
const TOKENS = cfg.faucet.tokens.map((t) => ({ sym: t.symbol, addr: t.address }));
const MINT_ID_ABI = [{ type: "function", name: "mint_id", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] }];
const HELPER_ABI = [
  { type: "function", name: "create_ata_for_key", stateMutability: "nonpayable", inputs: [{ name: "key", type: "bytes32" }, { name: "mint", type: "bytes32" }], outputs: [] },
  { type: "function", name: "transfer_spl", stateMutability: "nonpayable", inputs: [{ name: "to_ata", type: "bytes32" }, { name: "tokens", type: "uint64" }, { name: "mint", type: "bytes32" }], outputs: [] },
];
const b32 = (pk) => "0x" + Buffer.from(pk.toBytes()).toString("hex");

let pk = process.env.ETH_PK;
if (!pk) { console.error("set ETH_PK"); process.exit(1); }
if (!pk.startsWith("0x")) pk = "0x" + pk;

const account = privateKeyToAccount(pk);
const chain = defineChain({ id: CHAIN_ID, name: "Rome", nativeCurrency: { name: "gas", symbol: "GAS", decimals: 18 }, rpcUrls: { default: { http: [EVM] } } });
const pub = createPublicClient({ chain, transport: http(EVM) });
const wallet = createWalletClient({ account, chain, transport: http(EVM) });

const reserveAuth = PublicKey.findProgramAddressSync([Buffer.from("reserve")], NATIVE_FAUCET)[0];
console.log("deployer:", account.address);
console.log("native-faucet program:", NATIVE_FAUCET.toBase58());
console.log("reserve authority PDA:", reserveAuth.toBase58());

async function sendHelper(fn, args) {
  const data = encodeFunctionData({ abi: HELPER_ABI, functionName: fn, args });
  const hash = await wallet.sendTransaction({ to: HELPER, data, gas: 14_000_000n, gasPrice: 0n });
  const r = await pub.waitForTransactionReceipt({ hash });
  return r.status === "success";
}

const reserveAtas = {};
for (const t of TOKENS) {
  const mintHex = await pub.readContract({ address: t.addr, abi: MINT_ID_ABI, functionName: "mint_id" });
  const mint = new PublicKey(Buffer.from(mintHex.slice(2), "hex"));
  const reserveAta = getAssociatedTokenAddressSync(mint, reserveAuth, true, TOKEN);
  reserveAtas[t.sym] = reserveAta.toBase58();
  process.stdout.write(`  ${t.sym.padEnd(9)} mint ${mint.toBase58().slice(0, 8)}… reserveAta ${reserveAta.toBase58().slice(0, 8)}… `);
  try {
    const c = await sendHelper("create_ata_for_key", [b32(reserveAuth), b32(mint)]);
    process.stdout.write(`createAta=${c ? "ok" : "FAIL"} `);
  } catch (e) {
    process.stdout.write(`createAta=skip(${String(e.shortMessage || e).slice(0, 24)}) `);
  }
  const ok = await sendHelper("transfer_spl", [b32(reserveAta), FUND, b32(mint)]);
  console.log(`fund=${ok ? "ok" : "FAIL"} (+${FUND})`);
}
console.log("\n✓ native-faucet reserve funded. reserve ATAs:");
console.log(JSON.stringify(reserveAtas, null, 1));
