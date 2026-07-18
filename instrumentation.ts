// Next.js runs register() once at server startup. We validate the environment
// here so a misconfigured deploy fails fast at boot (clear error) rather than
// limping along with blank reads or a silent wrong-chain fallback.

export async function register() {
  // Node runtime only — skip the edge runtime (no full process.env there).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnv } = await import("./lib/env");
  validateEnv(process.env, { production: process.env.NODE_ENV === "production" });
}
