// Build-time loader that bundles every apps/compound/<chainId>-<slug>.json
// from the registry into a typed map keyed by chainId.  Aerarium looks up by
// wallet chainId at runtime; no chain-specific code anywhere in the demo.
//
// Adding a new chain = adding the JSON file to the registry + rebuilding.

import type { CompoundDeployment, CompoundChainConfig } from "./types";

/** Per-chain values the demo reads straight from the registry (chain.json + contracts.json). */
export interface ChainExtraFields {
  romeEvmProgramId?: string;
  solanaCluster?: string;
  multicall3?: `0x${string}`;
}
// NOTE: chain.json#solana.rpc is intentionally NOT projected here — it's a
// SERVER-ONLY value (the /api/solana-rpc upstream) and this config is bundled
// into the client. It's emitted to a separate server-only map by
// build-compound-config (generated.solana-rpc.json), read only server-side
// (lib/solanaRpc.ts). See #72.

/**
 * Extract the per-chain identity fields the demo needs but that don't live in
 * apps/compound: the rome-evm program id + Solana cluster (chain.json) and the
 * live Multicall3 address (contracts.json). All optional — a chain may omit any
 * of them (e.g. Aurelius has no contracts.json); consumers fail-fast on use.
 */
export function extractChainFields(
  chainJson: Record<string, unknown>,
  contractsJson?: unknown,
): ChainExtraFields {
  const solana = chainJson.solana as { cluster?: unknown } | undefined;
  let multicall3: `0x${string}` | undefined;
  if (Array.isArray(contractsJson)) {
    const entry = contractsJson.find(
      (c) => typeof c?.name === "string" && /^multicall3$/i.test(c.name),
    ) as { versions?: Array<{ address?: string; status?: string }> } | undefined;
    const live = entry?.versions?.find((v) => v.status === "live");
    if (typeof live?.address === "string") multicall3 = live.address as `0x${string}`;
  }
  return {
    romeEvmProgramId:
      typeof chainJson.romeEvmProgramId === "string" ? chainJson.romeEvmProgramId : undefined,
    solanaCluster: typeof solana?.cluster === "string" ? solana.cluster : undefined,
    multicall3,
  };
}

/**
 * Extract the PERSISTENT Address Lookup Tables the Solana-native lane attaches to
 * every DoTxUnsigned v0 tx (in place of building a per-user ALT at activation),
 * from a chains/<id>-<slug>/alts.json blob. The schema is
 * `{ tables: [{ pubkey, tier, dapp? }] }`; the two persistent tables are the
 * chain-tier table and the `comet` dApp table — every other dApp table (e.g.
 * romedefi-240) is ignored. Ordered comet ALT first, then the chain ALT.
 *
 * Pure / defensive: a missing or malformed blob yields [], so a chain without an
 * alts.json simply attaches no persistent ALTs (accounts then go inline).
 */
export function extractPersistentAlts(altsJson?: unknown): string[] {
  const tables = (altsJson as { tables?: unknown } | undefined)?.tables;
  if (!Array.isArray(tables)) return [];
  const pubkeyOf = (pred: (t: Record<string, unknown>) => boolean): string | undefined => {
    const t = tables.find(
      (x): x is Record<string, unknown> =>
        !!x && typeof x === "object" && pred(x as Record<string, unknown>),
    );
    return t && typeof t.pubkey === "string" ? t.pubkey : undefined;
  };
  const comet = pubkeyOf((t) => t.tier === "dapp" && t.dapp === "comet");
  const chain = pubkeyOf((t) => t.tier === "chain");
  return [comet, chain].filter((x): x is string => typeof x === "string" && x.length > 0);
}

/**
 * Build the demo-side config for one chain from its registry entry + the
 * resolved chain.json (RPC URL is referenced via rpcRef, not hardcoded).
 *
 * `chainJson` is the parsed contents of `chains/<chainId>-<slug>/chain.json`
 * and `contractsJson` of `chains/<chainId>-<slug>/contracts.json` — passed in
 * so the loader stays pure / testable.
 */
export function buildCompoundChainConfig(
  entry: CompoundDeployment,
  chainJson: Record<string, unknown>,
  contractsJson?: unknown,
  altsJson?: unknown,
): CompoundChainConfig {
  if (entry.status === "retired") {
    throw new Error(
      `apps/compound/${entry.chainId}-${entry.chainSlug}.json is retired; refusing to surface in demo`,
    );
  }

  const rpcUrl = resolveRpcRef(entry.rpcRef, chainJson);
  const cometsByLabel: Record<string, CompoundChainConfig["comets"][string]> = {};
  for (const c of entry.comets) {
    cometsByLabel[c.label] = {
      label: c.label,
      address: c.address as `0x${string}`,
      collateralAssets: c.collateralAssets as `0x${string}`[],
    };
  }
  const collatBySymbol: Record<string, CompoundChainConfig["collateralAssets"][string]> = {};
  for (const a of entry.collateralAssets) {
    collatBySymbol[a.symbol] = {
      symbol: a.symbol,
      address: a.address as `0x${string}`,
      decimals: a.decimals,
    };
  }

  const primaryComet =
    entry.comets.find((c) => c.label === "supply-only")?.label
    ?? entry.comets[0]?.label;
  if (!primaryComet) {
    throw new Error(`apps/compound/${entry.chainId}-${entry.chainSlug}.json has no comets[]`);
  }

  const chainName = (chainJson.name as string | undefined) ?? entry.chainSlug;
  const network = (chainJson.network as string | undefined) ?? "";
  // Explorer base from chain.json#explorerUrl (rome-via). Fall back to the
  // RPC URL only when the registry omits it, so a misconfigured chain still
  // builds (degraded) links rather than crashing the build.
  const explorerUrl =
    typeof chainJson.explorerUrl === "string" && chainJson.explorerUrl.length > 0
      ? chainJson.explorerUrl
      : rpcUrl;

  return {
    chainId: entry.chainId,
    chainSlug: entry.chainSlug,
    displayName: chainName,
    network,
    rpcUrl,
    explorerUrl,
    baseAsset: {
      address: entry.baseAsset.address as `0x${string}`,
      displaySymbol: entry.baseAsset.displaySymbol,
      underlyingMint: entry.baseAsset.underlyingMint,
    },
    comets: cometsByLabel,
    primaryComet,
    bulker: entry.bulker as `0x${string}`,
    collateralAssets: collatBySymbol,
    ux: entry.ux,
    jitoEnabled: entry.jito.enabled,
    persistentAlts: extractPersistentAlts(altsJson),
    ...extractChainFields(chainJson, contractsJson),
    faucet: entry.faucet
      ? {
          address: entry.faucet.address as `0x${string}`,
          selfServeAddress: entry.faucet.selfServeAddress as `0x${string}` | undefined,
          gasDropWei: BigInt(entry.faucet.gasDropWei),
          tokens: entry.faucet.tokens.map((t) => ({
            symbol: t.symbol,
            address: t.address as `0x${string}`,
            decimals: t.decimals,
            dropAmountWei: BigInt(t.dropAmountWei),
          })),
        }
      : undefined,
  };
}

/**
 * Resolves an rpcRef of the form `chains/<id>-<slug>/chain.json#<field>`
 * against a parsed chain.json blob.  Throws if the ref shape is wrong or
 * the referenced field is missing.
 */
export function resolveRpcRef(rpcRef: string, chainJson: Record<string, unknown>): string {
  const m = rpcRef.match(/^chains\/(\d+-[a-z0-9-]+)\/chain\.json#([a-zA-Z]+)$/);
  if (!m) {
    throw new Error(`Unsupported rpcRef shape: ${rpcRef}`);
  }
  const field = m[2];
  const v = chainJson[field];
  if (typeof v !== "string") {
    throw new Error(`rpcRef ${rpcRef} resolved to non-string value in chain.json`);
  }
  return v;
}

/**
 * Build a lookup map keyed by chainId from a list of (compound entry, chain
 * json) pairs.  Used at build time to bundle every chain the demo supports.
 *
 * Skips entries with status='retired'.  Throws on duplicate chainIds (a
 * registry invariant violation that CI should catch).
 */
export function buildCompoundChainConfigMap(
  inputs: Array<{ entry: CompoundDeployment; chainJson: Record<string, unknown>; contractsJson?: unknown; altsJson?: unknown }>,
): Record<number, CompoundChainConfig> {
  const map: Record<number, CompoundChainConfig> = {};
  for (const { entry, chainJson, contractsJson, altsJson } of inputs) {
    if (entry.status === "retired") continue;
    if (map[entry.chainId]) {
      throw new Error(`Duplicate chainId ${entry.chainId} in apps/compound; check registry for conflict`);
    }
    map[entry.chainId] = buildCompoundChainConfig(entry, chainJson, contractsJson, altsJson);
  }
  return map;
}
