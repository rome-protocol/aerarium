# Aerarium

Aerarium is a Compound v3 lending app on Rome, with two route-isolated lanes over **one shared pool**:

- **`/evm`** — EVM gate (MetaMask / wagmi), standard signed transactions.
- **`/solana`** — Solana-native gate (Phantom → Rome `DoTxUnsigned`), no Ethereum key; the connected Solana wallet's synthetic EVM address is `msg.sender`.

Both lanes read and write the same Comet, so supply / borrow / liquidate state is identical regardless of which wallet a user brings.

> **Integrating your own app on Rome?** See **[`docs/INTEGRATION.md`](docs/INTEGRATION.md)** — the reusable patterns behind Aerarium (chain-agnostic registry config, dual EVM + Solana-native lanes, account discovery, cached-oracle + keeper, CU budgeting) and the chain-agnostic dev tooling, with Aerarium/Hadrian as the worked example.

## Chain-agnostic by config

Aerarium is **not pinned to any one chain**. Chain identity — chain id, RPC, explorer, contract addresses, Multicall3, Solana program id, and cluster — is resolved per chain from the [Rome registry](https://github.com/rome-protocol/rome-registry) at build time (`npm run build:registry-config` → `lib/registry/generated.json`, also run as part of `npm run build`). Pointing the app at another Rome chain is a registry edit plus `NEXT_PUBLIC_DEFAULT_CHAIN_ID` — no code change.

## Develop

```bash
npm install
npm run build:registry-config   # regenerate chain config from the registry
npm run dev                     # http://localhost:3000
```

Set the chain and endpoints via env (see `.env.example`). With the registry checked out alongside (monorepo layout) or `ROME_REGISTRY_ROOT` set, the build picks up every chain that has an `apps/compound/<chainId>-<slug>.json` entry.

## Test

```bash
npm test            # vitest (unit + guards)
npm run test:e2e    # Playwright smoke
```

## Spec

[Compound on Rome with unified USDC](https://github.com/rome-protocol/compound-on-rome-comet).
