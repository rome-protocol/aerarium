"use client";

import { useEffect } from "react";

interface ToastProps {
  message?: string;
  txUrl?: string;
  onDismiss: () => void;
}

export function Toast({ message, txUrl, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);
  if (!message) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--rome-ink)",
        color: "var(--fg-inverse)",
        padding: "14px 20px",
        borderRadius: 999,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontFamily: "var(--font-sans)",
        fontSize: 14,
        boxShadow: "var(--shadow-md)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
        <path
          d="M2.5 6.2 L4.8 8.5 L9.5 3.5"
          stroke="#FBF8F4"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{message}</span>
      {txUrl && (
        <a
          href={txUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            color: "var(--rome-cream)",
            textDecoration: "underline",
            textUnderlineOffset: 3,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.06em",
          }}
        >
          view tx →
        </a>
      )}
    </div>
  );
}
