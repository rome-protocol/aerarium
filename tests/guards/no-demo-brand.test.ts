import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// P2.3 brand guard: the shipped app must not carry the old "compound-on-rome-demo"
// repo-slug branding. The two external refs that can't flip until the GitHub +
// Docker-Hub rename (P4) are allowed ONLY on lines annotated `aerarium-rename-pending`,
// which keeps them tracked. Sibling-repo provenance notes (`a companion Aave demo`) are
// fine — that's a real other repo, not this app calling itself a demo.
const REPO_SLUG = /compound-on-rome-demo/;
const ALLOW = /aerarium-rename-pending/;
const ROOTS = ["lib", "app", "components"];
const SKIP = /(__tests__|\.test\.|\.spec\.|generated\.json)/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (SKIP.test(p)) return [];
    return statSync(p).isDirectory()
      ? walk(p)
      : /\.(ts|tsx)$/.test(p)
        ? [p]
        : [];
  });
}

describe("no demo-repo branding in shipped code", () => {
  it("package.json name is aerarium", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.name).toBe("aerarium");
  });

  it("README is not branded compound-on-rome-demo", () => {
    expect(readFileSync("README.md", "utf8")).not.toMatch(REPO_SLUG);
  });

  it("no compound-on-rome-demo literal in code (except aerarium-rename-pending lines)", () => {
    const files = ROOTS.flatMap(walk);
    const hits = files.filter((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .some((line) => REPO_SLUG.test(line) && !ALLOW.test(line)),
    );
    expect(hits, `found in:\n${hits.join("\n")}`).toEqual([]);
  });

  // Capital-`Demo` only appears in identifiers/comments (lowercase `demoUrl` registry
  // field + `a companion Aave demo` provenance don't match). This app is Aerarium, not a
  // demo — config types/identifiers must use Aerarium/Chain naming, not *Demo*.
  it("no 'Demo' identifier/branding in shipped code", () => {
    const files = ROOTS.flatMap(walk);
    const hits = files.filter((f) => /Demo/.test(readFileSync(f, "utf8")));
    expect(hits, `found 'Demo' in:\n${hits.join("\n")}`).toEqual([]);
  });
});
