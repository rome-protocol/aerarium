// Public Solana devnet RPC — the dev-only fallback when neither an env override
// nor a per-chain registry rpc resolves. Production sets SOLANA_RPC (enforced
// at boot by validateEnv); this keeps local dev / CI / the unit suite working.
//
// Leaf module (no imports) so client code (probeConfig's SSR fallback) can use
// the constant WITHOUT pulling in lib/solanaRpc.ts — which imports the
// server-only per-chain RPC map and must never reach the client bundle (#72).
export const PUBLIC_DEVNET_RPC = "https://api.devnet.solana.com";
