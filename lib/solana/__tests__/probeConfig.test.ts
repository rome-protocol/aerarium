import { describe, it, expect } from 'vitest';
import { resolveProbeConfig, solanaRpcEndpoint } from '../probeConfig';
import { PUBLIC_DEVNET_RPC } from '@/lib/solanaRpc';
import { getCompoundConfig } from '@/lib/registry';
import { resolveDefaultChainId } from '@/lib/config';

// P1.6: ProbeConfig identity comes from the registry config for the selected
// chain — never a hardcoded Hadrian default. Env vars stay per-field overrides.
// Infra endpoints (solanaRpc / proxyUrl) default to same-origin proxy routes so
// the private RPC / discovery upstream never reach the client bundle (#72).
describe('resolveProbeConfig', () => {
  it('derives identity from the registry config for an explicit chainId', () => {
    const cfg = getCompoundConfig(121214)!; // Martius — multicall3 distinct from Hadrian
    const c = resolveProbeConfig({ NEXT_PUBLIC_ROME_CHAIN_ID: '121214' });
    expect(c.chainId).toBe(121214);
    expect(c.programId).toBe(cfg.romeEvmProgramId);
    expect(c.multicall3).toBe(cfg.multicall3);
    expect(c.solanaCluster).toBe(cfg.solanaCluster);
    expect(c.comet).toBe(cfg.comets[cfg.primaryComet].address);
    expect(c.baseAsset).toBe(cfg.baseAsset.address);
  });

  it('uses the runtime chainId (from /api/env) when NEXT_PUBLIC_ROME_CHAIN_ID is unset — so one image picks its chain at deploy time', () => {
    const cfg = getCompoundConfig(121214)!; // Martius
    const c = resolveProbeConfig({}, 121214);
    expect(c.chainId).toBe(121214);
    expect(c.programId).toBe(cfg.romeEvmProgramId);
    expect(c.multicall3).toBe(cfg.multicall3);
    expect(c.comet).toBe(cfg.comets[cfg.primaryComet].address);
  });

  it('lets the build-time NEXT_PUBLIC_ROME_CHAIN_ID override win over the runtime chainId (back-compat)', () => {
    const c = resolveProbeConfig({ NEXT_PUBLIC_ROME_CHAIN_ID: '121214' }, 200010);
    expect(c.chainId).toBe(121214);
  });

  it('falls back to the registry default chain when both env and runtime chainId are absent (no hardcoded Hadrian)', () => {
    const def = getCompoundConfig(resolveDefaultChainId())!;
    const c = resolveProbeConfig({}, null);
    expect(c.chainId).toBe(def.chainId);
    expect(c.programId).toBe(def.romeEvmProgramId);
    expect(c.multicall3).toBe(def.multicall3);
    expect(c.solanaRpc).toBeTruthy();
    expect(c.proxyUrl).toBeTruthy();
  });

  it('defaults proxyUrl to the same-origin /api/discovery route (no localhost in the client bundle)', () => {
    const c = resolveProbeConfig({});
    // proxyUrl must default to a same-origin relative path — never an
    // http://localhost URL, which Next.js would inline into the client bundle
    // (caught by scripts/check-bundle-no-localhost.sh).
    expect(c.proxyUrl).toBe('/api/discovery');
    expect(c.proxyUrl).not.toMatch(/localhost/);
  });

  it('defaults solanaRpc to the same-origin /api/solana-rpc proxy path (private RPC never in the client)', () => {
    const c = resolveProbeConfig({});
    // solanaRpc must default to a same-origin relative path — the browser
    // submits the DoTxUnsigned through /api/solana-rpc, which forwards
    // server-side to the private SOLANA_RPC. No absolute RPC URL (public or
    // private) is ever inlined into the client.
    expect(c.solanaRpc).toBe('/api/solana-rpc');
    expect(c.solanaRpc).not.toMatch(/localhost/);
    expect(c.solanaRpc).not.toMatch(/romeprotocol\.xyz/);
  });

  it('lets env override every field', () => {
    const c = resolveProbeConfig({
      NEXT_PUBLIC_DISCOVERY_PROXY_URL: 'http://localhost:7070',
      NEXT_PUBLIC_SOLANA_RPC: 'https://my.devnet',
      NEXT_PUBLIC_ROME_EVM_PROGRAM: 'SomeOtherProgram1111111111111111111111111111',
      NEXT_PUBLIC_ROME_CHAIN_ID: '99',
      NEXT_PUBLIC_COMET_PROXY: '0x1e2541D3eF3C2F9780978C6A814932c1aF642751',
      NEXT_PUBLIC_UNIFIED_TOKEN: '0xcF9535f0877bf0b8567D1a072e773eea3f4Fd5B9',
    });
    expect(c.proxyUrl).toBe('http://localhost:7070');
    expect(c.solanaRpc).toBe('https://my.devnet');
    expect(c.programId).toBe('SomeOtherProgram1111111111111111111111111111');
    expect(c.chainId).toBe(99);
    expect(c.comet).toBe('0x1e2541D3eF3C2F9780978C6A814932c1aF642751');
    expect(c.baseAsset).toBe('0xcF9535f0877bf0b8567D1a072e773eea3f4Fd5B9');
  });

  it('treats an empty-string env var as unset (falls back to config default)', () => {
    const def = getCompoundConfig(resolveDefaultChainId())!;
    const c = resolveProbeConfig({ NEXT_PUBLIC_ROME_EVM_PROGRAM: '' });
    expect(c.programId).toBe(def.romeEvmProgramId);
  });
});

// web3.js Connection requires an absolute URL, but the default solanaRpc is a
// same-origin relative path. solanaRpcEndpoint resolves it against the browser
// origin; an absolute NEXT_PUBLIC_SOLANA_RPC override passes through untouched.
describe('solanaRpcEndpoint', () => {
  it('prefixes a same-origin relative proxy path with the origin', () => {
    expect(solanaRpcEndpoint('/api/solana-rpc', 'https://aerarium.devnet.romeprotocol.xyz')).toBe(
      'https://aerarium.devnet.romeprotocol.xyz/api/solana-rpc',
    );
  });

  it('passes an absolute http(s) URL through unchanged (NEXT_PUBLIC_SOLANA_RPC dev override)', () => {
    expect(solanaRpcEndpoint('https://my.devnet', 'https://aerarium.devnet.romeprotocol.xyz')).toBe(
      'https://my.devnet',
    );
    expect(solanaRpcEndpoint('http://localhost:8899', 'http://localhost:3000')).toBe(
      'http://localhost:8899',
    );
  });

  it('resolves a relative path to an absolute SSR-safe fallback when origin is empty (web3.js Connection requires an absolute URL at construction; never used to connect during prerender)', () => {
    const ep = solanaRpcEndpoint('/api/solana-rpc', '');
    expect(ep).toMatch(/^https?:\/\//);
    expect(ep).toBe(PUBLIC_DEVNET_RPC);
  });
});
