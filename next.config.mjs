/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` produces a self-contained `.next/standalone/` directory
  // (server.js + bundled node_modules) the Docker `runner` stage copies in.
  // Mirrors rome-sovereign-portal / rome-oracle-portal pattern.
  output: 'standalone',
  reactStrictMode: true,
  // Default chain is resolved at RUNTIME via /api/env (DEFAULT_CHAIN_ID) + the
  // RuntimeWagmiProvider. We deliberately do NOT bake NEXT_PUBLIC_DEFAULT_CHAIN_ID
  // here — a hardcoded value is compile-inlined and pins every image to one chain
  // (the 200010 bug: per-chain instances all defaulted to Hadrian). First paint
  // falls back to a live registry chain (safety net excludes retired real-testnet)
  // until /api/env resolves. A build may still set NEXT_PUBLIC_DEFAULT_CHAIN_ID to
  // pin a chain (Next auto-inlines NEXT_PUBLIC_*); we just don't force one.
  webpack: (config) => {
    // Suppress optional dep warnings from wallet adapters.
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
  // No RPC rewrites: the same-origin RPC proxy is the app/api/rome-rpc route
  // handler (which resolves its upstream from the registry per chain). The old
  // rewrites hardcoded one chain and were dead anyway — afterFiles rewrites are
  // overridden by the route handler, and /api/solana-rpc had no callers.
};

export default nextConfig;
