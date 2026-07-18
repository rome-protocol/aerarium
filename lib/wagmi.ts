import { createConfig, http } from "wagmi";
import { defineChain, type Address, type Hex } from "viem";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

import { DEFAULT_CHAIN_CONFIG, configForChain } from "./config";
import { mockWallet } from "./mock-wallet";
import { assertMockWalletSafe } from "./env";

// Fail fast if a production build/runtime tries to enable the local-signing
// mock wallet (its private key is a NEXT_PUBLIC_ var that would be inlined into
// the client bundle). Runs at module init on both server and client.
assertMockWalletSafe(process.env, { production: process.env.NODE_ENV === "production" });

// Multicall3 lets viem fold the dozens of readContract calls each hook fires
// into a single eth_call per microtask. Per-chain address comes from the
// registry (contracts.json), surfaced on the resolved config as multicall3.

// Build the viem chain for a given Rome chain id, falling back to the
// build-time default (DEFAULT_CHAIN_CONFIG) when no id is supplied (boot/SSR) or the id
// has no Compound deployment in the registry. The chain id MUST match the
// runtime-resolved chain (/api/env); otherwise usePublicClient({ chainId })
// returns undefined and every read silently no-ops — see RuntimeWagmiProvider.
export function chainFor(chainId?: number) {
  const rome =
    (chainId != null ? configForChain(chainId)?.rome : undefined) ?? DEFAULT_CHAIN_CONFIG.rome;
  return defineChain({
    id: rome.chainId,
    name: rome.name,
    nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [rome.rpc] } },
    contracts: rome.multicall3 ? { multicall3: { address: rome.multicall3 } } : undefined,
  });
}

// `batch.wait` is the window (ms) viem waits to coalesce concurrent calls into
// one POST; small enough to keep first-paint snappy, large enough to collect
// parallel reads fired by the same useEffect tick.
const TRANSPORT_BATCH_WAIT_MS = 16;

// Build-time default chain — used by the boot config and tests. Runtime mounts
// rebuild for the actual chain via createWagmiConfig(projectId, chainId).
export const defaultChain = chainFor();

const MOCK_WALLET_ENABLED = process.env.NEXT_PUBLIC_MOCK_WALLET === "1";
const MOCK_WALLET_ADDRESS = (process.env.NEXT_PUBLIC_MOCK_WALLET_ADDRESS ?? "") as Address;
const MOCK_WALLET_PRIVATE_KEY = (process.env.NEXT_PUBLIC_MOCK_WALLET_PRIVATE_KEY ?? "") as Hex;

/**
 * Placeholder projectId. RainbowKit hard-fails at module-init time when
 * projectId is the empty string, so we substitute this dud when the runtime
 * env hasn't been wired (or hasn't returned from /api/env yet). Wallet
 * connect via the modal is non-functional on this projectId — MetaMask /
 * Rainbow / Base still work via their injected paths.
 */
export const WALLETCONNECT_PROJECT_ID_PLACEHOLDER = "00000000000000000000000000000000";

/**
 * Build a wagmi config for the runtime-resolved WalletConnect projectId.
 * Called once per provider mount (after /api/env resolves) so the image
 * doesn't bake any deployment-specific value in. Mock-wallet mode short-
 * circuits the RainbowKit path entirely.
 */
export function createWagmiConfig(walletConnectProjectId: string, chainId?: number) {
  const chain = chainFor(chainId);
  const transport = http(chain.rpcUrls.default.http[0], {
    batch: { wait: TRANSPORT_BATCH_WAIT_MS },
  });
  if (MOCK_WALLET_ENABLED && MOCK_WALLET_ADDRESS) {
    return createConfig({
      chains: [chain],
      transports: { [chain.id]: transport },
      ssr: true,
      connectors: [
        mockWallet({
          address: MOCK_WALLET_ADDRESS,
          privateKey: MOCK_WALLET_PRIVATE_KEY || undefined,
          chain,
          // Use the same-origin proxy (rome.rpc resolves to /api/rome-rpc in
          // browser) — direct upstream calls trigger CORS preflight blocking
          // on the chain's nginx.
          rpcUrl: chain.rpcUrls.default.http[0],
        }),
      ],
    });
  }
  return getDefaultConfig({
    appName: "Aerarium",
    projectId: walletConnectProjectId || WALLETCONNECT_PROJECT_ID_PLACEHOLDER,
    chains: [chain],
    transports: { [chain.id]: transport },
    ssr: true,
  });
}

/**
 * Boot-time config used during SSR (no runtime env available yet) and as the
 * initial value before the EnvProvider's /api/env fetch resolves. Substitutes
 * the placeholder projectId; once useEnv() returns a real value the provider
 * rebuilds the wagmi config via createWagmiConfig().
 *
 * Kept as a named export to preserve the import shape of consumers that
 * imported `config` directly (mostly tests). New runtime consumers should
 * read the config from the provider, not from this module.
 */
export const config = createWagmiConfig(WALLETCONNECT_PROJECT_ID_PLACEHOLDER);

export const isMockWallet = MOCK_WALLET_ENABLED;
