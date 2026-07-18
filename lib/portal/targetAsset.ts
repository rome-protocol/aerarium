/**
 * Per-row action target. Resolves the asset address clicked in a portal
 * table (AssetsToSupplyTable / YourSuppliesTable / etc.) into the
 * symbol+decimals pair the ActionModal needs. Returns `null` when the
 * address IS the base asset — that's the legacy account-card path where
 * the modal already defaults to base, and the per-row clicker shouldn't
 * thread a target.
 *
 * Address comparison is case-insensitive; preserves the caller's casing
 * for the returned `address` so downstream contract calls don't shift
 * the EIP-55 checksum.
 */
export interface TargetAsset {
  symbol: string;
  address: string;
  decimals: number;
}

export function targetForAddress(
  asset: string,
  baseAsset: string,
  symbolByAsset: Record<string, string>,
  decimalsByAsset: Record<string, number>,
): TargetAsset | null {
  if (asset.toLowerCase() === baseAsset.toLowerCase()) return null;
  const key = asset.toLowerCase();
  const symbol = symbolByAsset[key];
  const decimals = decimalsByAsset[key];
  if (symbol == null || decimals == null) return null;
  return { symbol, address: asset, decimals };
}
