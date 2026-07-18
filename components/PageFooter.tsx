"use client";

import type { CSSProperties } from "react";
import { useTheme } from "@/hooks/useTheme";

export interface PageFooterProps {
  /** Active chain name (the active chain's display name). Optional so a pre-config render doesn't crash. */
  chainName?: string;
  /** Rome network classification (testnet / devnet / mainnet). Optional. */
  network?: string;
}

const SOURCE_REPO_URL = "https://github.com/rome-protocol/aerarium";
const SPEC_URL =
  "https://github.com/rome-protocol/compound-on-rome-comet";

// Trust-line footer. Replaces the two `#` placeholder anchors that were
// shipped in PR #43. Pattern mirrors lending-UI conventions: brand mark +
// "backed by" provenance line + live-status pill + repo links.
export function PageFooter({ chainName, network }: PageFooterProps = {}) {
  const { theme } = useTheme();
  const logomarkSrc =
    theme === "light" ? "/brand/logomark-tight.svg" : "/brand/logomark-tight-white.svg";
  const trustLine = chainName
    ? `Backed by Compound v3 · ${chainName}${network ? ` · ${network}` : ""}`
    : `Backed by Compound v3`;

  return (
    <footer
      style={{
        marginTop: 80,
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "24px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <img
            src={logomarkSrc}
            alt=""
            style={{ width: 18, height: 18, opacity: 0.7 }}
          />
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              color: "var(--fg2)",
            }}
          >
            {trustLine}
          </span>
          {chainName ? (
            <span
              aria-label={`Status: ${chainName} live`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px 3px 8px",
                borderRadius: 999,
                background: "var(--hf-safe-bg)",
                color: "var(--hf-safe)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.08em",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 6,
                  background: "var(--hf-safe)",
                  boxShadow: "0 0 6px var(--hf-safe)",
                }}
              />
              {chainName} live
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          <a href={SOURCE_REPO_URL} target="_blank" rel="noreferrer" style={footerLink}>
            GitHub ↗
          </a>
          <a href={SPEC_URL} target="_blank" rel="noreferrer" style={footerLink}>
            Docs ↗
          </a>
        </div>
      </div>
    </footer>
  );
}

const footerLink: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--fg2)",
  textDecoration: "none",
};
