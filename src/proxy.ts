import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Public routes that should never trigger a redirect-to-login even if
// the session has expired. The proxy still runs `getUser()` on these
// paths so that stale access tokens get silently refreshed, which
// keeps users logged in across browser restarts.
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

  // Always call `getUser()` — even on public routes — so that a stale
  // access token gets refreshed from the refresh token and the new
  // cookies get written back on `supabaseResponse`. This is what
  // actually keeps users logged in across sessions.
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
