// Diagnose the borrow revert: (1) did the wBTC collateral register, (2) is the
// reverting callee (e6b9bd3d…) a price feed, and (3) does any feed revert on
// latestRoundData (stale-cache). Read-only.
import { createPublicClient, http, defineChain, encodeFunctionData, decodeFunctionResult } from "viem";
import { loadChain } from "./_chain.mjs";

const { EVM, COMET, CHAIN_ID, ASSET_ADDR } = loadChain();
const SYNTH = "0xd868eec27e47376e739d0a3555f81b7657faa322"; // 55R41 synthetic
const SUSPECT = "0xe6b9bd3d50e3e4bf73724065e6f9f99fd1b8b027";
const wBTC = ASSET_ADDR.wBTC;

const COMET_ABI = [
  { type: "function", name: "numAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "baseToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "baseTokenPriceFeed", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "collateralBalanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }, { name: "asset", type: "address" }], outputs: [{ type: "uint128" }] },
  { type: "function", name: "getAssetInfo", stateMutability: "view", inputs: [{ name: "i", type: "uint8" }], outputs: [{ type: "tuple", components: [{ name: "offset", type: "uint8" }, { name: "asset", type: "address" }, { name: "priceFeed", type: "address" }, { name: "scale", type: "uint64" }, { name: "borrowCF", type: "uint64" }, { name: "liqCF", type: "uint64" }, { name: "liqFactor", type: "uint64" }, { name: "supplyCap", type: "uint128" }] }] },
];
const FEED_ABI = [
  { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [{ name: "roundId", type: "uint80" }, { name: "answer", type: "int256" }, { name: "startedAt", type: "uint256" }, { name: "updatedAt", type: "uint256" }, { name: "answeredInRound", type: "uint80" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
];

const pub = createPublicClient({ chain: defineChain({ id: CHAIN_ID, name: "Rome", nativeCurrency: { name: "g", symbol: "G", decimals: 18 }, rpcUrls: { default: { http: [EVM] } } }), transport: http(EVM) });
const read = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });

console.log("=== collateral registered? ===");
try { console.log(`  collateralBalanceOf(synth, wBTC) = ${await read(COMET, COMET_ABI, "collateralBalanceOf", [SYNTH, wBTC])}`); } catch (e) { console.log(`  ERR ${e.shortMessage || e}`); }

console.log("\n=== comet price feeds ===");
const baseFeed = await read(COMET, COMET_ABI, "baseTokenPriceFeed").catch(() => "n/a");
console.log(`  base feed: ${baseFeed}`);
const n = Number(await read(COMET, COMET_ABI, "numAssets"));
const feeds = [{ label: "base", feed: baseFeed }];
for (let i = 0; i < n; i++) {
  const info = await read(COMET, COMET_ABI, "getAssetInfo", [i]);
  feeds.push({ label: info.asset, feed: info.priceFeed });
  const isSuspect = info.priceFeed.toLowerCase() === SUSPECT.toLowerCase();
  console.log(`  asset[${i}] ${info.asset} → feed ${info.priceFeed}${isSuspect ? "   ★ == the reverting callee" : ""}`);
}
const baseIsSuspect = String(baseFeed).toLowerCase() === SUSPECT.toLowerCase();
if (baseIsSuspect) console.log(`  ★ base feed == the reverting callee`);

console.log("\n=== latestRoundData per feed (revert = stale-cache) ===");
const seen = new Set();
for (const { label, feed } of feeds) {
  if (!feed || feed === "n/a" || seen.has(feed.toLowerCase())) continue;
  seen.add(feed.toLowerCase());
  try {
    const r = await read(feed, FEED_ABI, "latestRoundData");
    const now = Math.floor(Date.now() / 1000);
    const age = now - Number(r[3]);
    console.log(`  ${feed} (${label.slice(0, 10)}): answer=${r[1]} updatedAt=${r[3]} age=${age}s ${age > 120 ? "⚠️STALE?" : "ok"}`);
  } catch (e) {
    console.log(`  ${feed} (${label.slice(0, 10)}): ❌ REVERTS — ${(e.shortMessage || String(e)).slice(0, 80)}`);
  }
}
