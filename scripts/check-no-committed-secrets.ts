#!/usr/bin/env tsx
/**
 * Guard: fail if a private key ever gets committed again.
 *
 * Runs in CI (and locally) over git-tracked files only — so gitignored
 * .env.local is never scanned. Targets key-*context*, not bare 64-hex, so
 * event-signature / calldata fixtures don't false-positive.
 *
 * Added after the 2026-07 e2e-key rotation: the mock-wallet key had been
 * committed in playwright.config.ts and e2e.yml. This makes recurrence a
 * red build instead of a silent leak.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

export type Finding = {
  kind: "evm-private-key" | "solana-keypair";
  match: string;
  context: string;
};

const KEY_CONTEXT =
  /(PRIVATE[_-]?KEY|PRIVKEY|SECRET[_-]?KEY|MNEMONIC|KEYPAIR|_PK\b|\bPK\s*[:=])/i;
const EVM_HEX = /0x[0-9a-fA-F]{64}/g;
// 64 (or 32) comma-separated 0-255 ints = a Solana secret key / seed array.
const SOLANA_KEYPAIR = /\[(?:\s*\d{1,3}\s*,){31,}\s*\d{1,3}\s*\]/g;

export function scanText(content: string): Finding[] {
  const findings: Finding[] = [];

  for (const m of content.matchAll(EVM_HEX)) {
    const idx = m.index ?? 0;
    // Look back far enough to span a `const NAME =\n  "0x..."` line break.
    const context = content.slice(Math.max(0, idx - 64), idx);
    if (KEY_CONTEXT.test(context)) {
      findings.push({ kind: "evm-private-key", match: m[0], context: context.trim() });
    }
  }

  for (const m of content.matchAll(SOLANA_KEYPAIR)) {
    findings.push({
      kind: "solana-keypair",
      match: m[0].slice(0, 24) + "…",
      context: "",
    });
  }

  return findings;
}

function main(): void {
  const files = execSync("git ls-files", { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    // binaries / lockfiles can't hold source-level secrets meaningfully and are noisy
    .filter((f) => !/\.(png|jpg|jpeg|gif|ico|woff2?|ttf|lock)$/.test(f));

  const hits: { file: string; finding: Finding }[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // unreadable/binary — skip
    }
    for (const finding of scanText(text)) hits.push({ file, finding });
  }

  if (hits.length > 0) {
    console.error(`✗ committed-secret guard FAILED — ${hits.length} finding(s):\n`);
    for (const { file, finding } of hits) {
      const masked =
        finding.kind === "evm-private-key"
          ? finding.match.slice(0, 6) + "…MASKED"
          : finding.match;
      console.error(`  ${file}: ${finding.kind} (${masked})`);
      if (finding.context) console.error(`    context: …${finding.context}`);
    }
    console.error(
      `\nSecrets must come from env vars / CI secrets, never committed literals.`
    );
    process.exit(1);
  }
  console.log("✓ committed-secret guard passed — no key literals in tracked files");
}

// Run main() only as a CLI, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) main();
