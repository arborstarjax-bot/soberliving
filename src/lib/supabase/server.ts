import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Keep the Supabase auth cookie around for ~1 year. The default in
// @supabase/ssr is 400 days, but we set it explicitly here (and in the
// proxy) so the value never silently changes under us on an upgrade.
// The practical effect: users stay logged in across browser restarts /
// PWA cold starts until they explicitly sign out, as long as the
// refresh token is still valid on the Supabase side.
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
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
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored — the proxy refreshes sessions on
            // every request, so the new cookies will be written there.
          }
        },
      },
    }
  );
}

/**
 * Admin client using the service role key.
 * Only use server-side for privileged operations (e.g. auth.admin.createUser).
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
