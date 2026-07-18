"use client";

import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

/**
 * Wallet-adapter's WalletMultiButton reads localStorage on mount, so its
 * client render differs from the SSR render. Defer to client-only to avoid
 * Next's hydration-mismatch warning.
 */
export function ClientOnlyWalletButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    // Placeholder with the same shape so layout doesn't shift.
    return (
      <button
        type="button"
        disabled
        style={{
          background: "var(--rome-purple)",
          color: "var(--fg-inverse)",
          border: "none",
          borderRadius: 4,
          padding: "0 24px",
          height: 48,
          fontFamily: "var(--font-sans)",
          fontWeight: 500,
          fontSize: 15,
          cursor: "default",
          opacity: 0.7,
        }}
      >
        Connect Phantom
      </button>
    );
  }
  return <WalletMultiButton />;
}
