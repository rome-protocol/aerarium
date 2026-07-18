// One-shot refresh of the comet's 9 OG-V2 CachedPythAdapter feeds so latestRoundData
// stops reverting StalePriceFeed (which blocks borrow's collateralization check).
// Calls refresh() on each (re-reads the Pyth PDA → updates the SLOAD cache).
// ETH_PK from env (never printed).
//   ETH_PK=$(jq -r .privateKey <your-deployer-key.json>) node scripts/refresh-feeds.mjs
import { createPublicClient, createWalletClient, http, defineChain, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadChain } from "./_chain.mjs";

const { EVM, CHAIN_ID } = loadChain();
const FEEDS = [
  { sym: "base/wUSDC", addr: "0xe6b9bD3d50E3E4bF73724065E6F9f99Fd1b8B027" },
  { sym: "wETH", addr: "0xED815CAe213b16B092d531D0a511E77D43a3C805" },
  { sym: "wSOL", addr: "0x23F18946e1c3dcB710Be9548F9C66d1e877CC1F6" },
  { sym: "wBTC", addr: "0x63Ecae6b814f4A6a8E31CF4B38C82fee21b5a842" },
  { sym: "wJitoSOL", addr: "0xF08cb365f3f34A288eDd9223F22F1d9397351B39" },
  { sym: "wmSOL", addr: "0xf01bDDA1091120804f901E0D5f0293ee9616F62b" },
  { sym: "wJUP", addr: "0xBe43c0d3dFBC10313bF7fBaD67Dc93EC1cA136E7" },
  { sym: "wJTO", addr: "0x420cD39f59Eea11e3A8e01A9B3C830ff9a2793ae" },
  { sym: "wBONK", addr: "0xC63Af5d67d2A655a087BF635F3980DCe041963de" },
];
const REFRESH_ABI = [{ type: "function", name: "refresh", stateMutability: "nonpayable", inputs: [], outputs: [] }];

let pk = process.env.ETH_PK;
if (!pk) { console.error("set ETH_PK"); process.exit(1); }
if (!pk.startsWith("0x")) pk = "0x" + pk;

const account = privateKeyToAccount(pk);
const chain = defineChain({ id: CHAIN_ID, name: "Rome", nativeCurrency: { name: "gas", symbol: "GAS", decimals: 18 }, rpcUrls: { default: { http: [EVM] } } });
const pub = createPublicClient({ chain, transport: http(EVM) });
const wallet = createWalletClient({ account, chain, transport: http(EVM) });
console.log("refresher:", account.address);

let ok = 0, fail = 0;
for (const f of FEEDS) {
  try {
    const data = encodeFunctionData({ abi: REFRESH_ABI, functionName: "refresh", args: [] });
    const hash = await wallet.sendTransaction({ to: f.addr, data, gas: 90_000_000n, gasPrice: 0n });
    const r = await pub.waitForTransactionReceipt({ hash });
    console.log(`  ${f.sym.padEnd(11)} ${f.addr} → ${r.status}`);
    r.status === "success" ? ok++ : fail++;
  } catch (e) {
    console.log(`  ${f.sym.padEnd(11)} ${f.addr} → FAIL ${String(e.shortMessage || e.message || e).slice(0, 70)}`);
    fail++;
  }
}
console.log(`\n=== ${ok} refreshed, ${fail} failed ===`);
