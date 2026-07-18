"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { HealthFactorPill } from "./HealthFactorPill";
import { Button } from "./ui/Button";
import { useTheme } from "@/hooks/useTheme";

export interface PageHeaderProps {
  /** From useAccountStats().liquidationRiskPct (0..1). Pass null when no account / no debt. */
  riskRatio: number | null;
  /** Active chain's display name. Parameterized from registry (e.g. chain.json#name). */
  chainName: string;
}

// EVM-lane nav. The header renders only inside /evm/* (it's part of the EVM
// Shell), so every destination is under /evm. The logo link (below) points to
// "/" — the route back out to the shared landing.
const NAV = [
  { href: "/evm", label: "Dashboard" },
  { href: "/evm/markets", label: "Markets" },
  { href: "/evm/supply", label: "Supply" },
  { href: "/evm/borrow", label: "Borrow" },
  { href: "/evm/liquidate", label: "Liquidate" },
  { href: "/evm/history", label: "History" },
  { href: "/evm/faucet", label: "Faucet" },
];

export function PageHeader({ riskRatio, chainName }: PageHeaderProps) {
  const pathname = usePathname();
  const { theme } = useTheme();
  // Brand SVGs ship in two variants — the white set is for the dark
  // canvas, the bare set is for the cream/light canvas. Without the swap
  // the light-mode header looked empty (white-on-cream = invisible).
  const logomarkSrc =
    theme === "light" ? "/brand/logomark-tight.svg" : "/brand/logomark-tight-white.svg";
  const wordmarkSrc =
    theme === "light" ? "/brand/wordmark-tight.svg" : "/brand/wordmark-tight-white.svg";
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "var(--header-bg)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "14px 32px",
          display: "flex",
          alignItems: "center",
          gap: 24,
          minHeight: 72,
        }}
      >
        <Link
          href="/"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", flexShrink: 0 }}
        >
          <img src={logomarkSrc} alt="" style={{ height: 30, width: "auto" }} />
          <img src={wordmarkSrc} alt="Rome" style={{ height: 30, width: "auto" }} />
          <span
            className="mono"
            style={{
              marginLeft: 10,
              fontSize: 10,
              color: "var(--fg2)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "5px 8px",
              background: "var(--bg-surface-2)",
              borderRadius: "var(--r-sm)",
              fontWeight: 500,
            }}
          >
            Compound v3
          </span>
        </Link>

        <nav style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 16 }} aria-label="Primary">
          {NAV.map((n) => {
            const isActive = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? "var(--fg1)" : "var(--fg2)",
                  textDecoration: "none",
                  padding: "8px 14px",
                  borderRadius: "var(--r-pill)",
                  background: isActive ? "rgba(197, 139, 198, 0.10)" : "transparent",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {isActive ? (
                  <span
                    aria-hidden="true"
                    style={{ width: 5, height: 5, borderRadius: 5, background: "var(--rome-purple-tint)" }}
                  />
                ) : null}
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {riskRatio !== null ? <HealthFactorPill riskRatio={riskRatio} /> : null}
        <ChainPill chainName={chainName} />
        <ConnectButton.Custom>
          {({ account, chain, openConnectModal, openAccountModal, openChainModal, mounted }) => {
            const ready = mounted;
            const connected = ready && account && chain;
            if (!connected) {
              return (
                <Button variant="primary" size="sm" onClick={openConnectModal}>
                  Connect wallet
                </Button>
              );
            }
            if (chain.unsupported) {
              return (
                <Button variant="secondary" size="sm" onClick={openChainModal}>
                  Wrong network
                </Button>
              );
            }
            return (
              <button
                onClick={openAccountModal}
                aria-label="Account"
                style={{
                  appearance: "none",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--r-pill)",
                  padding: "6px 14px",
                  color: "var(--fg1)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                }}
              >
                {account.displayName}
              </button>
            );
          }}
        </ConnectButton.Custom>
      </div>
    </header>
  );
}

function ChainPill({ chainName }: { chainName: string }) {
  return (
    <div
      aria-label={`Active chain: ${chainName}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px 6px 8px",
        borderRadius: "var(--r-pill)",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        fontFamily: "var(--font-sans)",
        fontSize: 12,
        color: "var(--fg1)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: 7,
          background: "var(--hf-safe)",
          boxShadow: "0 0 6px var(--hf-safe)",
        }}
      />
      <span>{chainName}</span>
    </div>
  );
}
