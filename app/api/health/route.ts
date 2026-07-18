/**
 * Liveness probe — used by:
 *   - Docker HEALTHCHECK (built into the image; runner stage uses node fetch)
 *   - Deploy verification (`curl https://<host>/api/health`)
 *   - Future external uptime monitor
 *
 * Response is a constant `{ ok: true }`. The app has no DB and no
 * external dependencies (direct Compound — the Rome RPC is checked
 * implicitly by the chain reads inside CompoundPanel).
 */
export async function GET() {
  return Response.json({ ok: true });
}
