// Boot-time environment validation. Fail-fast on misconfiguration instead of
// silently falling back to a hardcoded chain — a missing RPC upstream or an
// unparseable chain id should stop the server at startup with a clear message,
// not surface later as blank position cards or reads against the wrong chain.
//
// Pure (takes env + flags as args) so it's unit-testable; instrumentation.ts
// passes process.env + the real NODE_ENV at server start.

export interface ValidatedEnv {
  /** RPC upstream override, or null when the server proxy should use the active chain's registry RPC. */
  romeRpcUpstream: string | null;
  /** Pinned default chain id, or null when relying on the registry default (non-production). */
  defaultChainId: number | null;
  /**
   * Private Solana RPC the /api/solana-rpc proxy forwards the DoTxUnsigned to.
   * Required in production (the proxy otherwise falls back to the public devnet
   * endpoint); null outside production where that fallback is acceptable.
   */
  solanaRpc: string | null;
  /**
   * Upstream the /api/discovery proxy forwards rome_emulateCallAccounts to.
   * Required in production (it otherwise silently defaults to localhost:9090);
   * null outside production.
   */
  discoveryProxyUpstream: string | null;
}

export interface ValidateEnvOptions {
  /** True in a production deploy — requires an explicit chain pin for determinism. */
  production: boolean;
}

/**
 * Refuse the local-signing mock wallet in production. The mock connector signs
 * with NEXT_PUBLIC_MOCK_WALLET_PRIVATE_KEY, which Next inlines into the client
 * bundle — that key must never ship in a production build. Throws if either the
 * enable flag or a mock private key is set while `production` is true.
 */
export function assertMockWalletSafe(
  env: Record<string, string | undefined>,
  opts: ValidateEnvOptions,
): void {
  if (!opts.production) return;
  if (env.NEXT_PUBLIC_MOCK_WALLET === "1" || env.NEXT_PUBLIC_MOCK_WALLET_PRIVATE_KEY) {
    throw new Error(
      "Refusing to enable the mock wallet in production: unset NEXT_PUBLIC_MOCK_WALLET and " +
        "NEXT_PUBLIC_MOCK_WALLET_PRIVATE_KEY (the mock signer key must never ship in a prod build).",
    );
  }
}

export function validateEnv(
  env: Record<string, string | undefined>,
  opts: ValidateEnvOptions,
): ValidatedEnv {
  assertMockWalletSafe(env, opts);
  // RPC upstream is an OVERRIDE, not required: the rome-rpc route falls back to
  // the active chain's canonical RPC from the registry, so a missing value is
  // safe (never a hardcoded chain).
  const romeRpcUpstream = env.ROME_RPC_UPSTREAM || env.NEXT_PUBLIC_ROME_RPC || null;

  // Solana-lane endpoints are read SERVER-SIDE ONLY — never NEXT_PUBLIC_, which
  // Next would inline into the client bundle (the private SOLANA_RPC must not
  // ship to the browser). Required in production; outside production the proxy
  // routes fall back (public devnet RPC / localhost discovery) for local dev.
  const solanaRpc = env.SOLANA_RPC || null;
  const discoveryProxyUpstream = env.DISCOVERY_PROXY_UPSTREAM || null;
  if (opts.production) {
    if (!solanaRpc) {
      throw new Error(
        "Missing SOLANA_RPC in production: set the (private) Solana RPC the /api/solana-rpc proxy forwards the DoTxUnsigned to. NEXT_PUBLIC_SOLANA_RPC is NOT accepted (it would inline into the client bundle).",
      );
    }
    if (!discoveryProxyUpstream) {
      throw new Error(
        "Missing DISCOVERY_PROXY_UPSTREAM in production: set the rome_emulateCallAccounts upstream the /api/discovery proxy forwards to (it silently defaults to http://localhost:9090 otherwise).",
      );
    }
  }

  const rawChainId = env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? env.DEFAULT_CHAIN_ID ?? null;
  if (rawChainId === null) {
    if (opts.production) {
      // Production must pin the chain explicitly — don't let registry ordering
      // silently pick the active chain in a live deploy.
      throw new Error(
        "Missing default chain in production: set NEXT_PUBLIC_DEFAULT_CHAIN_ID (or DEFAULT_CHAIN_ID).",
      );
    }
    return { romeRpcUpstream, defaultChainId: null, solanaRpc, discoveryProxyUpstream };
  }

  const defaultChainId = Number(rawChainId);
  if (!Number.isFinite(defaultChainId)) {
    throw new Error(`Invalid default chain id: "${rawChainId}" is not a number.`);
  }
  return { romeRpcUpstream, defaultChainId, solanaRpc, discoveryProxyUpstream };
}
