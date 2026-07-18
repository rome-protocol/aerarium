/**
 * Build a Solana Explorer transaction URL for the given cluster. The cluster
 * comes from the registry (chain.json#solana.cluster, surfaced on ProbeConfig)
 * so links open the correct cluster on any chain — never a hardcoded devnet.
 */
export function solanaExplorerTx(sig: string, cluster: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
}
