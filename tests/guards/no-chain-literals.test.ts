import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Chain-specific literals that must live in the registry (→ generated.json),
// never in app or dev-tooling code. Aerarium is chain-agnostic: every chain id,
// program id, cluster, and contract address resolves per-chain from the registry
// config, so none of these may be hardcoded under lib/app/components/scripts.
// When generalizing a new surface, add the chain's identifying literals here so
// it can't drift back.
const FORBIDDEN: Array<[string, RegExp]> = [
  ["chainId 200010", /\b200010\b/],
  ["program RPTWwELX", /RPTWwELXAY4KC9ZPHhaxp7Sq1hHtU3HNEgLbSegCcWf/],
  ["?cluster=devnet", /cluster=devnet/],
  ["multicall3 literal", /0xb7180d3c46632b582b99d9af3daae394fab9ae4c/i],
  ["comet 0x771D2f", /0x771D2f213b4C23f70Fa884d441a405F41F51Ab50/i],
  ["base wUSDC 0x9a8B4cB7", /0x9a8B4cB7326033d72cA393c6b4C0d7Fb904Fa900/i],
];
const ROOTS = ["lib", "app", "components", "scripts"];
const SKIP = /(__tests__|\.test\.|\.spec\.|generated\.json)/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (SKIP.test(p)) return [];
    return statSync(p).isDirectory()
      ? walk(p)
      : /\.(ts|tsx|mjs)$/.test(p)
        ? [p]
        : [];
  });
}

describe("no Hadrian literals in app or dev-tooling code", () => {
  const files = ROOTS.flatMap(walk);
  for (const [label, re] of FORBIDDEN) {
    it(`has no ${label}`, () => {
      const hits = files.filter((f) => re.test(readFileSync(f, "utf8")));
      expect(hits, `found in:\n${hits.join("\n")}`).toEqual([]);
    });
  }
});
