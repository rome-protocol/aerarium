import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./aerarium-tokens.css";
import { RootProviders } from "./providers";

export const metadata: Metadata = {
  title: "Aerarium",
  description: "Aerarium — one shared lending pool, two rival gates (EVM + Solana) on Rome",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: theme-init.js sets data-theme on <html> before
    // hydration, so the server markup intentionally differs from the client.
    // Scoped to <html>'s own attributes — does not mask mismatches in children.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* No-flash theme init — must run before first paint so the
            data-theme attribute is set in the DOM before CSS resolves
            the html[data-theme="light"] selector. Render-blocking
            beforeInteractive runs synchronously in <head>. */}
        <Script src="/theme-init.js" strategy="beforeInteractive" />
        {/* Cinzel — the inscriptional display face the Aerarium landing
            uses (matches the designer's delivered look). Loaded globally
            but only referenced by the landing's --font-display fallback. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
