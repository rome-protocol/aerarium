import { describe, it, expect } from "vitest";
import { getCompoundConfig } from "../index";

// Integration: the per-chain registry fields must flow through the build →
// generated.json → getCompoundConfig read path, not just the pure extractor.
describe("getCompoundConfig surfaces per-chain identity fields", () => {
  it("Hadrian (200010) carries program id, cluster, and its own multicall3", () => {
    const c = getCompoundConfig(200010);
    expect(c).toBeDefined();
    expect(c!.romeEvmProgramId).toMatch(/^RPTWwELX/);
    expect(c!.solanaCluster).toBe("devnet");
    expect(c!.multicall3).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  // The Solana lane attaches these PERSISTENT ALTs (registry alts.json comet +
  // chain tiers) to every DoTxUnsigned v0 tx instead of building a per-user ALT.
  // They must flow through the build → generated.json → getCompoundConfig path.
  it("Hadrian (200010) carries the persistent comet + chain ALTs", () => {
    const c = getCompoundConfig(200010);
    expect(c!.persistentAlts).toEqual([
      "458nSqg6qzcsgYr1DiDrs59UBJD8VRsvpiiHP7rQ3MVk",
      "9DswaXsjcqozpbUUnL24wRqteqZTZH1UqCpFcsYWcgQP",
    ]);
  });
});
