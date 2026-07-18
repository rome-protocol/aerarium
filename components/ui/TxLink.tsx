"use client";

import type { ReactNode } from "react";

interface TxLinkProps {
  href: string;
  children?: ReactNode;
}

export function TxLink({ href, children = "view tx →" }: TxLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        letterSpacing: "0.04em",
        color: "var(--rome-purple)",
        textDecoration: "underline",
        textUnderlineOffset: 3,
      }}
    >
      {children}
    </a>
  );
}
