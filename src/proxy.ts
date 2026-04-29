import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Public routes that should never trigger a redirect-to-login even if
// the session has expired. The proxy still refreshes stale tokens on
// these paths so users stay logged in across browser restarts.
const publicRoutes = [
  "/login",
  "/signup",
  "/register",
  "/reset-password",
  "/forgot-password",
  "/application-denied",
  "/offline",
];

// Keep the Supabase auth cookie around for ~1 year so the refresh
// token survives PWA cold starts and infrequent use. Must match
// AUTH_COOKIE_MAX_AGE in src/lib/supabase/server.ts.
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Refresh the access token only when it's within this window of expiry.
// Outside this window the JWT is trusted locally (decoded from cookie)
// which skips the ~100-200ms network round-trip to Supabase Auth.
const REFRESH_WINDOW_SECONDS = 5 * 60; // 5 minutes

/**
 * Decode a JWT's payload without verification. The proxy uses this to
 * read `exp` and `sub` from the access token so it can skip the
 * network call to Supabase Auth when the token is still fresh.
 * Actual cryptographic verification happens in getSessionUser() via
 * supabase.auth.getUser().
 */
function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload, "base64").toString("utf-8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Read the Supabase access token from the chunked auth cookie.
 * Supabase SSR stores the session as JSON in `sb-<ref>-auth-token`
 * (or `sb-<ref>-auth-token.0`, `.1`, ... for large payloads).
 * Returns the access_token string or null.
 */
function readAccessToken(req: NextRequest): string | null {
  const allCookies = req.cookies.getAll();
  // Find the auth token cookie(s) — name starts with "sb-" and contains "-auth-token"
  const authPrefix = allCookies.find(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token")
  );
  if (!authPrefix) return null;

  // Reconstruct the value from chunks if needed
  const baseName = authPrefix.name.replace(/\.\d+$/, "");
  const chunks = allCookies
    .filter((c) => c.name === baseName || c.name.startsWith(`${baseName}.`))
    .sort((a, b) => {
      const aIdx = a.name === baseName ? -1 : parseInt(a.name.split(".").pop()!, 10);
      const bIdx = b.name === baseName ? -1 : parseInt(b.name.split(".").pop()!, 10);
      return aIdx - bIdx;
    })
    .map((c) => c.value);

  try {
    const raw = chunks.join("");
    // Supabase SSR stores the session as base64-encoded JSON
    let parsed: { access_token?: string };
    try {
      parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    } catch {
      parsed = JSON.parse(raw);
    }
    return parsed.access_token ?? null;
  } catch {
    return null;
  }
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip proxy for static assets and API auth routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        maxAge: AUTH_COOKIE_MAX_AGE,
        sameSite: "lax",
        path: "/",
      },
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // --- Fast path: decode the JWT locally to avoid network call ---
  // getUser() makes an HTTP request to Supabase Auth on every
  // invocation (~100-200ms). For the vast majority of requests the
  // access token is still valid (Supabase tokens last 1h by default).
  // We decode the JWT locally to check `exp` — if the token has >5min
  // of life left, we trust it and skip the network call entirely.
  // When the token IS close to expiry we fall through to getUser()
  // which triggers the refresh and writes new cookies.
  //
  // Security: the proxy's job is routing (redirect unauthed users).
  // Actual auth validation happens in getSessionUser() via getUser()
  // in the Server Component layer.
  const accessToken = readAccessToken(req);
  const jwt = accessToken ? decodeJwtPayload(accessToken) : null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const tokenExp = typeof jwt?.exp === "number" ? jwt.exp : 0;
  const tokenFresh = tokenExp - nowSeconds > REFRESH_WINDOW_SECONDS;
  const hasSub = typeof jwt?.sub === "string" && jwt.sub.length > 0;

  if (tokenFresh && hasSub) {
    // Token is still fresh — skip the network call
    if (publicRoutes.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
      return supabaseResponse;
    }
    return supabaseResponse;
  }

  // Token is missing, expired, or close to expiry — call getUser()
  // to trigger a refresh and write new cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // On public routes we never redirect — the page itself decides
  // what to do with an authed / unauthed visitor.
  if (publicRoutes.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return supabaseResponse;
  }

  if (!user) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
