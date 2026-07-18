// /flows is a developer harness page (Phantom → drive every Solana-native Comet
// flow end-to-end). Like /discovery, it must not be reachable in a production
// deploy — gate it off unless a build explicitly opts in via
// NEXT_PUBLIC_ENABLE_FLOWS=1.

export function isFlowsEnabled(
  env: Record<string, string | undefined>,
  opts: { production: boolean },
): boolean {
  if (!opts.production) return true;
  return env.NEXT_PUBLIC_ENABLE_FLOWS === "1";
}
