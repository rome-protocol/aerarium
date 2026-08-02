# syntax=docker/dockerfile:1.6
#
# Compound-on-Rome demo image. Mirrors rome-sovereign-portal's three-stage
# layout (deps / builder / runner) without the Prisma machinery — the demo
# has no DB. NEXT_PUBLIC_* values are inlined at BUILD time (Next.js spec
# behavior) — to point at a non-default backend, pass them as build-args.
# The default fallbacks resolve to same-origin relative paths so the same
# image works in any deploy whose nginx routes /api/* + /api/relayer/*.

# --- deps: install dependencies (cached separately from the source copy) ---
FROM node:22-alpine AS deps
# Native build chain for the addon deps that don't ship prebuilts for
# alpine arm64. The biggest culprit is `usb` (transitively pulled in by
# @ledgerhq/hw-transport-node-hid via the wallet adapter set) — needs
# eudev-dev (libudev) + linux-headers in addition to the standard
# python3/make/g++. Stripped from the runtime image.
RUN apk add --no-cache libc6-compat python3 make g++ eudev-dev linux-headers
WORKDIR /app
# npm is the canonical package manager (see package.json#packageManager). CI
# (npm ci) and this image build from the SAME package-lock.json, so the tested
# tree matches the shipped one. --legacy-peer-deps mirrors CI's install.
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# --- builder: produce the standalone Next.js bundle ---
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# WalletConnect projectId is NOT baked into the build. The image reads it
# server-side at runtime via process.env.WALLETCONNECT_PROJECT_ID and ships
# it to the browser through /api/env (see lib/env-context.tsx). Mirrors
# rome-ui's runtime-env pattern: one image runs against any deploy.
#
# Same for the Solana-lane infra endpoints SOLANA_RPC + DISCOVERY_PROXY_UPSTREAM:
# read server-side at runtime by the /api/solana-rpc + /api/discovery proxy
# routes, never inlined. The browser talks only to those same-origin routes, so
# the (private) RPC never reaches the client. Required in production — the boot
# validateEnv (instrumentation.ts) fails fast if either is missing.
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build \
 && sh scripts/check-bundle-no-localhost.sh

# --- runner: minimal production runtime ---
FROM node:22-alpine AS runner
# tini reaps zombie processes when next's server forks workers. We strip npm
# from the runtime — `node server.js` is the entrypoint and npm ships
# transitive deps that show up on the SBOM (brace-expansion / picomatch).
RUN apk add --no-cache libc6-compat tini \
 && rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/bin/npm \
           /usr/local/bin/npx
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
