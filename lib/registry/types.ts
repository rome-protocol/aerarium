// Types mirroring @rome-protocol/registry's CompoundDeployment.  Kept
// local until v0.11.0 publishes on NPM and we can replace these with
// `import type { CompoundDeployment } from "@rome-protocol/registry"`.
//
// Schema source-of-truth: registry/schema/appsCompound.schema.json
//   (PR https://github.com/rome-protocol/registry/pull/120, merged 2026-05-17)

export interface CompoundDeployment {
  schemaVersion: "1";
  chainId: number;
  chainSlug: string;
  compoundVersion: string;
  baseAsset: {
    type: "wrapper" | "native-erc20";
    address: string;
    underlyingMint?: string;
    displaySymbol: string;
    sourceRef: string;
  };
  comets: Array<{
    label: string;
    address: string;
    extensionDelegate: string;
    implementation: string;
    proxyAdmin: string;
    collateralAssets: string[];
  }>;
  bulker: string;
  collateralAssets: Array<{
    symbol: string;
    address: string;
    priceFeed: string;
    priceFeedKind: "pyth-pull" | "switchboard-v3" | "chainlink" | "simple";
    decimals: number;
  }>;
  baseTokenPriceFeed: string;
  baseTokenPriceFeedKind: "pyth-pull" | "switchboard-v3" | "chainlink" | "simple";
  jito: {
    enabled: boolean;
    reason?: string;
    endpoint?: string | null;
    tipAccount?: string;
  };
  ux: {
    singleTxFlows: string[];
    bundleFlows: string[];
    fallbackFlows: string[];
  };
  demoUrl: string;
  rpcRef: string;
  deployedAt: string;
  sourceCommits: Record<string, string>;
  status: "live" | "retired" | "draft";
  notes?: string;
  /**
   * Optional test-funds faucet. When present, the demo's /faucet page is
   * active for this chain. Mainnet deployments leave this undefined.
   */
  faucet?: {
    address: string;
    /**
     * Optional user-signed SelfServeFaucet. When present, the Solana-native lane
     * claims from THIS contract instead of `address` (CompoundFaucet): it drops
     * the configured amount from its own reserve to the caller's Phantom wallet
     * ATA, so test funds are visible in Phantom — vs CompoundFaucet, which only
     * credits the synthetic's EVM wrapper balanceOf (never a Solana ATA).
     */
    selfServeAddress?: string;
    gasDropWei: string; // bigint as decimal string
    tokens: Array<{
      symbol: string;
      address: string;
      decimals: number;
      dropAmountWei: string;
    }>;
  };
}

/** App-side normalized config for one chain. Built by loadCompoundConfig from a CompoundDeployment + RomeChain. */
export interface CompoundChainConfig {
  chainId: number;
  chainSlug: string;
  /** Display-friendly chain label, e.g. "Hadrian (Rome testnet)". */
  displayName: string;
  /**
   * Rome network tier — sourced from chains/<id>-<slug>/chain.json#network.
   * Used by resolveDefaultChainId to prefer 'testnet' chains over others.
   */
  network: string;
  /** Rome EVM RPC URL resolved from rpcRef into chain.json. */
  rpcUrl: string;
  /**
   * Block-explorer base URL (rome-via instance), sourced from
   * chains/<id>-<slug>/chain.json#explorerUrl — e.g.
   * "https://via-hadrian.testnet.romeprotocol.xyz/". All tx/address links
   * are built off this, NOT the RPC URL. Falls back to rpcUrl when the
   * chain.json omits explorerUrl (defensive; Hadrian has it set).
   */
  explorerUrl: string;
  baseAsset: {
    address: `0x${string}`;
    displaySymbol: string;
    underlyingMint?: string;
  };
  /** All Comet variants on this chain, keyed by label. */
  comets: Record<string, {
    label: string;
    address: `0x${string}`;
    collateralAssets: `0x${string}`[];
  }>;
  /** The Comet variant the demo should default to (heuristic: first 'supply-only' label if present, otherwise comets[0]). */
  primaryComet: string;
  bulker: `0x${string}`;
  /** Collateral assets keyed by symbol for lookups. */
  collateralAssets: Record<string, {
    symbol: string;
    address: `0x${string}`;
    decimals: number;
  }>;
  /** Which user-facing flows the demo can render on this chain. */
  ux: {
    singleTxFlows: string[];
    bundleFlows: string[];
    fallbackFlows: string[];
  };
  /** Jito bundle path enabled? When false, demo uses N-tx sequential for multi-action flows. */
  jitoEnabled: boolean;
  /**
   * Persistent Address Lookup Tables (base58 pubkeys) the Solana-native lane
   * attaches to every DoTxUnsigned v0 tx — the registry's comet + chain ALTs
   * (chains/<id>-<slug>/alts.json, `comet` dApp tier + `chain` tier). Replaces
   * the per-user ALT the lane used to create at activation. Empty [] on chains
   * with no alts.json (those tx then carry all accounts inline).
   */
  persistentAlts: string[];
  /**
   * rome-evm program id this chain runs on — chains/<id>/chain.json#romeEvmProgramId.
   * Per-chain (different chains ride different programs); the Solana-native lane
   * submits DoTxUnsigned to this program. Undefined when the chain.json omits it.
   */
  romeEvmProgramId?: string;
  /**
   * Solana cluster (devnet | testnet | mainnet-beta) for explorer links + RPC
   * defaulting — chain.json#solana.cluster. Undefined when omitted.
   */
  solanaCluster?: string;
  // NOTE: per-chain Solana RPC (chain.json#solana.rpc) is deliberately NOT on
  // this client-bundled config — it's a server-only value resolved in
  // /api/solana-rpc from generated.solana-rpc.json. See #72 / lib/solanaRpc.ts.
  /**
   * Per-chain Multicall3 address — the `status:"live"` version in
   * chains/<id>/contracts.json. Undefined when the chain has no Multicall3
   * (consumers must fail-fast rather than fall back to another chain's address).
   */
  multicall3?: `0x${string}`;
  /**
   * Optional test-funds faucet metadata (one-time drip for fresh wallets).
   * Undefined on chains where no faucet has been deployed (mainnet).
   * The /faucet page renders an "unavailable" message when absent.
   */
  faucet?: {
    address: `0x${string}`;
    /**
     * Optional user-signed SelfServeFaucet (drops to the caller's Phantom wallet
     * ATA). The Solana-native /solana/faucet page targets this when set;
     * undefined chains fall back to crediting the synthetic via CompoundFaucet.
     */
    selfServeAddress?: `0x${string}`;
    gasDropWei: bigint;
    tokens: Array<{
      symbol: string;
      address: `0x${string}`;
      decimals: number;
      dropAmountWei: bigint;
    }>;
  };
}
