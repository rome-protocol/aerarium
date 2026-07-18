// Local-signing mock wallet connector — dev / Playwright-smoke only.
//
// Why this exists: when NEXT_PUBLIC_MOCK_WALLET=1 is set, the demo runs
// without MetaMask installed.  Wagmi reports a connected account
// (NEXT_PUBLIC_MOCK_WALLET_ADDRESS), reads forward to the configured chain's RPC, and
// eth_sendTransaction is signed locally via viem's privateKeyToAccount
// using NEXT_PUBLIC_MOCK_WALLET_PRIVATE_KEY then submitted as
// eth_sendRawTransaction.  This lets headless browser smokes drive the
// full portal — connect, render, transact — with no MetaMask popup.
//
// SAFETY:
// - Mainnet hard-block: if the configured chain id matches Solana
//   mainnet's Rome chain (currently undefined; placeholder), throw at
//   load time.  The configured chains are devnet/testnet today anyway.
// - The privkey lands in the client bundle (it's a NEXT_PUBLIC_ var) —
//   that's the price for headless tx signing.  The testUser has trivial
//   testnet funds; do NOT point this at a funded mainnet account.
// - The connector is only registered when NEXT_PUBLIC_MOCK_WALLET=1.
//   Default builds (no env var) bundle nothing extra.

import { createConnector } from "@wagmi/core";
import { privateKeyToAccount } from "viem/accounts";
import {
  custom,
  http,
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  type Chain,
} from "viem";

const MAINNET_CHAIN_IDS_BLOCKED = new Set<number>([
  // Rome mainnet chain id when assigned — placeholder.
]);

export interface MockWalletParameters {
  /** Wallet address to report as connected. */
  address: Address;
  /** Optional private key (0x-hex 32-byte) for eth_sendTransaction signing. */
  privateKey?: Hex;
  /** Chain to mock as connected to (must be in wagmi.config.chains). */
  chain: Chain;
  /** Upstream RPC URL for read + raw-tx submission. */
  rpcUrl: string;
}

mockWallet.type = "mockSigning" as const;

export function mockWallet(parameters: MockWalletParameters) {
  if (MAINNET_CHAIN_IDS_BLOCKED.has(parameters.chain.id)) {
    throw new Error(
      `mockWallet refused: chainId ${parameters.chain.id} is on the mainnet block-list`,
    );
  }
  const { address, privateKey, chain, rpcUrl } = parameters;
  const signer = privateKey ? privateKeyToAccount(privateKey) : null;
  let connected = true;

  return createConnector((config) => ({
    id: "mockSigning",
    name: "Mock Wallet (testUser)",
    type: mockWallet.type,

    async setup() {},

    async connect({ chainId }: { chainId?: number } = {}) {
      connected = true;
      const cid = chainId ?? chain.id;
      config.emitter.emit("change", { accounts: [address], chainId: cid });
      return { accounts: [address] as readonly Address[], chainId: cid } as any;
    },

    async disconnect() {
      connected = false;
    },

    async getAccounts() {
      if (!connected) return [];
      return [address] as readonly Address[];
    },

    async getChainId() {
      return chain.id;
    },

    async isAuthorized() {
      return connected;
    },

    async switchChain({ chainId }) {
      const target = config.chains.find((c) => c.id === chainId);
      if (!target) throw new Error(`Chain ${chainId} not configured`);
      config.emitter.emit("change", { chainId });
      return target;
    },

    async getProvider() {
      // EIP-1193-compatible provider that signs locally and forwards reads.
      // Resolve relative rpcUrl to absolute so viem's http() accepts it
      // (browser-side: e.g. "/api/rome-rpc" → "http://host:port/api/rome-rpc").
      const resolvedUrl =
        typeof window !== "undefined" && rpcUrl.startsWith("/")
          ? new URL(rpcUrl, window.location.origin).href
          : rpcUrl;
      const publicClient = createPublicClient({ chain, transport: http(resolvedUrl) });
      const walletClient = signer
        ? createWalletClient({ chain, account: signer, transport: http(resolvedUrl) })
        : null;

      return custom({
        async request({ method, params }: { method: string; params?: readonly unknown[] }) {
          // Account / chain queries — answered locally.
          if (method === "eth_accounts" || method === "eth_requestAccounts") {
            return [address];
          }
          if (method === "eth_chainId") {
            return `0x${chain.id.toString(16)}`;
          }
          if (method === "net_version") {
            return chain.id.toString();
          }
          if (method === "wallet_switchEthereumChain") {
            return null;
          }
          if (method === "wallet_requestPermissions") {
            return [{ parentCapability: "eth_accounts" }];
          }
          if (method === "wallet_getPermissions") {
            return [{ parentCapability: "eth_accounts" }];
          }

          // Signing — requires the private key.
          if (method === "personal_sign" || method === "eth_sign") {
            if (!signer) throw new Error("mockWallet: no privateKey configured for signing");
            const [data, _addr] = method === "personal_sign"
              ? (params as [Hex, Address])
              : ((params as [Address, Hex])[1], (params as [Address, Hex]));
            const msg = (method === "personal_sign" ? (params as [Hex, Address])[0] : (params as [Address, Hex])[1]) as Hex;
            return signer.signMessage({ message: { raw: msg } });
          }
          if (method === "eth_signTypedData_v4") {
            if (!signer) throw new Error("mockWallet: no privateKey configured for signing");
            const [_addr, typedDataJson] = params as [Address, string];
            const td = JSON.parse(typedDataJson);
            return signer.signTypedData(td);
          }

          // Local sign + submit as raw tx.
          if (method === "eth_sendTransaction") {
            if (!walletClient || !signer) {
              throw new Error("mockWallet: no privateKey configured for tx submission");
            }
            const [tx] = params as [{
              from?: Address;
              to?: Address;
              value?: Hex;
              data?: Hex;
              gas?: Hex;
              gasPrice?: Hex;
              maxFeePerGas?: Hex;
              maxPriorityFeePerGas?: Hex;
              nonce?: Hex;
            }];
            return walletClient.sendTransaction({
              account: signer,
              to: tx.to,
              data: tx.data,
              value: tx.value ? BigInt(tx.value) : 0n,
              gas: tx.gas ? BigInt(tx.gas) : undefined,
            });
          }

          // Everything else — forward to the upstream RPC via the public client.
          return publicClient.transport.request({ method, params });
        },
      })({ retryCount: 0 });
    },

    onAccountsChanged(accounts: string[]) {
      if (accounts.length === 0) this.onDisconnect();
      else config.emitter.emit("change", { accounts: accounts as readonly Address[] });
    },
    onChainChanged(hexChainId: string) {
      const cid = Number(hexChainId);
      config.emitter.emit("change", { chainId: cid });
    },
    onDisconnect() {
      connected = false;
      config.emitter.emit("disconnect");
    },
  }));
}
