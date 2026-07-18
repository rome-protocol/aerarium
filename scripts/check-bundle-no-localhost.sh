#!/bin/sh
# Build-time guard: catch the class of regression where a client-side
# fallback URL like "http://localhost:8787" gets baked into the bundled
# JS by Next.js (which inlines NEXT_PUBLIC_* at build, not runtime).
#
# We had this exact bug 2026-05-09 — the relayer URL fell through to
# localhost in the deployed image because CI built without the env var,
# and there was no automated check. This script runs as the last step
# of `next build` so a future regression fails the build, not a user.
#
# Convention: client code defaults to a same-origin relative path
# (e.g. "/api/relayer") which works in any deploy. Localhost is fine
# in dev, but must never make it into a production bundle.
set -eu

BUNDLE_DIR=".next"

if [ ! -d "$BUNDLE_DIR" ]; then
  echo "[check-bundle] $BUNDLE_DIR/ not found — run after \`next build\`."
  exit 1
fi

# Scope: only the bundles that ship to / SSR for browsers. Server-side
# API routes (.next/server/app/api/**) legitimately reference localhost
# in dev configs (e.g. iris-api-mock URLs), so we skip them.
SCAN_DIRS="$BUNDLE_DIR/static/chunks"
SCAN_FILES="$BUNDLE_DIR/server/app/page.js"
[ -d "$BUNDLE_DIR/server/app/_not-found" ] && SCAN_DIRS="$SCAN_DIRS $BUNDLE_DIR/server/app/_not-found"

# 1. No literal "http://localhost:NNNN" in any client-facing chunk.
HITS=$(grep -rEn 'http://localhost:[0-9]+' $SCAN_DIRS $SCAN_FILES 2>/dev/null || true)
if [ -n "$HITS" ]; then
  echo "[check-bundle] ❌ client-facing JS contains hardcoded localhost URL:"
  echo "$HITS" | head -10
  echo
  echo "Cause: a client-side fallback like \`process.env.NEXT_PUBLIC_X ?? \"http://localhost:NNNN\"\`"
  echo "got inlined at build time. Default to a same-origin path like \"/api/relayer\" instead."
  exit 1
fi

# 2. Positive check — the relayer same-origin path must be present in
#    the page bundle. Catches the case where someone deletes the
#    fallback entirely and breaks browser eth_* fetches.
#    (Was '/api/relayer' before the vanilla Compound cutover; the demo
#    now reads chain RPC through its own /api/rome-rpc proxy to avoid
#    CORS on chain endpoints.)
if ! grep -rqE '/api/rome-rpc' $SCAN_DIRS $SCAN_FILES 2>/dev/null; then
  echo "[check-bundle] ❌ bundle missing /api/rome-rpc — client wiring may be broken."
  exit 1
fi

echo "[check-bundle] ✓ no hardcoded localhost; /api/rome-rpc present."
