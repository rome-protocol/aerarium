// /discovery is a developer probe page (Phantom → rome_emulateCallAccounts).
// It must not be reachable in a production deploy — gate it off unless a build
// explicitly opts in via NEXT_PUBLIC_ENABLE_DISCOVERY=1.

export function isDiscoveryEnabled(
  env: Record<string, string | undefined>,
  opts: { production: boolean },
): boolean {
  if (!opts.production) return true;
  return env.NEXT_PUBLIC_ENABLE_DISCOVERY === "1";
}
