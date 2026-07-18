"use client";

import { useState } from "react";
import { shortAddr } from "./format";

interface AddressChipProps {
  address: string;
  onDisconnect?: () => void;
}

export function AddressChip({ address, onDisconnect }: AddressChipProps) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 14px 6px 10px",
          border: "1px solid var(--border-default)",
          borderRadius: 999,
          background: "var(--bg-surface)",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#3FA66B",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            letterSpacing: "0.02em",
            color: "var(--fg1)",
            cursor: "pointer",
          }}
          onClick={() => {
            navigator.clipboard?.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          title="Click to copy"
        >
          {copied ? "copied" : shortAddr(address)}
        </span>
      </div>
      {onDisconnect && (
        <button
          onClick={onDisconnect}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            color: "var(--fg2)",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          Disconnect
        </button>
      )}
    </div>
  );
}
