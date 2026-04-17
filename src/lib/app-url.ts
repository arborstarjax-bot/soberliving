import { headers } from "next/headers";

/**
 * Derive the app's public origin for emails and redirect URLs.
 *
 * Prefers the incoming request's forwarded host/proto (works on every
 * deploy host — vercel.app preview URLs, custom domains, localhost)
 * without depending on NEXT_PUBLIC_SITE_URL being set. Falls back to
 * the env vars and finally localhost for server-side contexts that
 * don't have an incoming request (e.g. cron jobs, though we don't
 * currently ship any).
 *
 * Usage: const origin = await getAppOrigin();
 */
export async function getAppOrigin(): Promise<string> {
  try {
    const h = await headers();
    // x-forwarded-* headers can be comma-separated when the request
    // traverses multiple proxies (e.g. AWS ALB → Cloudflare → Vercel).
    // Take the left-most value, which represents the original client-
    // facing hop.
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
    // headers() throws outside a request scope; fall through to env.
  }
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}
