import { headers } from "next/headers";

/**
 * Derive the app's public origin for emails and redirect URLs.
 *
 * Resolution order (most-trusted first):
 *   1. Explicit operator-configured env vars — `NEXT_PUBLIC_SITE_URL`
 *      or `NEXT_PUBLIC_APP_URL`. Production deployments should set
 *      one of these; it's the only source that's immune to
 *      host-header injection (an authed user crafting a malicious
 *      `X-Forwarded-Host` header to phish invite emails).
 *   2. Vercel's built-in env vars — `VERCEL_PROJECT_PRODUCTION_URL`
 *      (stable on the production deploy) and `VERCEL_URL` (preview
 *      deploys). Both are host-only, so we prepend https://.
 *   3. Incoming request headers (`x-forwarded-host` / `host`). Only
 *      used when nothing above is set — typically local dev. On
 *      self-hosted deploys behind a reverse proxy you should set
 *      `NEXT_PUBLIC_SITE_URL` rather than trusting these headers.
 *   4. Final fallback: `http://localhost:3000`.
 *
 * Usage: const origin = await getAppOrigin();
 */
export async function getAppOrigin(): Promise<string> {
  // 1. Explicit operator config — always wins.
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return stripTrailingSlash(explicit);

  // 2. Vercel-provided hostnames. Prefer the production alias when it's
  // the production environment; otherwise use the per-deploy URL so
  // preview deploys still work without any manual config.
  const vercelHost =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;

  // 3. Last resort: derive from request headers. These are
  // attacker-controllable on deployments that don't sanitize them,
  // so we treat them as a dev/self-hosted convenience rather than a
  // trust anchor.
  try {
    const h = await headers();
    // x-forwarded-* headers can be comma-separated when the request
    // traverses multiple proxies. Take the left-most value.
    const firstValue = (raw: string | null) =>
      raw?.split(",")[0]?.trim() || null;
    const forwardedHost = firstValue(h.get("x-forwarded-host"));
    const forwardedProto = firstValue(h.get("x-forwarded-proto"));
    const host = forwardedHost ?? h.get("host");
    if (host) {
      const proto =
        forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // headers() throws outside a request scope; fall through.
  }

  // 4. Local dev default.
  return "http://localhost:3000";
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
