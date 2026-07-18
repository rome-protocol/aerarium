// Block-explorer URL builders for Rome chains.
//
// The explorer is the rome-via instance for the chain (e.g.
// https://via-hadrian.testnet.romeprotocol.xyz/), sourced from the
// registry chain.json `explorerUrl` field — NOT the RPC endpoint. An
// earlier version built links from `config.rome.rpc`, which on the browser
// resolves to the `/api/rome-rpc` proxy path and produced broken links
// like `/api/rome-rpctx/<hash>`.
//
// Both builders normalize a trailing slash on the base so we never emit a
// double slash (`…xyz//tx/<hash>`) — the exact bug the Rome web app's ActivityFeed
// hit when it appended `/tx/` to a base that already ended in `/`.

function normalizeBase(explorerBase: string): string {
  return explorerBase.replace(/\/$/, "");
}

/** Block-explorer URL for an EVM transaction hash. */
export function explorerTxUrl(explorerBase: string, txHash: string): string {
  return `${normalizeBase(explorerBase)}/tx/${txHash}`;
}

/** Block-explorer URL for an EVM address. */
export function explorerAddressUrl(explorerBase: string, address: string): string {
  return `${normalizeBase(explorerBase)}/address/${address}`;
}
