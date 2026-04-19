import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Small server-side cache for rarely-changing admin dropdowns.
 * Currently just active-houses — the houses list feeds form pickers
 * on /bulletin, /bulletin/ride-share, /bulletin/blockers, /chores,
 * /payments, /incidents, /discipline, /residents/[id], etc. Every
 * page render previously issued its own Supabase query for the same
 * tiny list.
 *
 * The underlying `houses` table barely changes in normal operation,
 * so we serve the list from Next.js' in-memory data cache with a
 * 5-minute TTL backstop AND tag-based invalidation. houses/actions.ts
 * calls `revalidateTag(HOUSES_ACTIVE_TAG)` on create/update/archive,
 * so entries drop immediately on any write. The TTL is a defence-
 * in-depth fallback in case a code path ever forgets to revalidate.
 *
 * Callers that need per-user scoping (e.g. managers restricted to
 * their assigned houses) should filter the returned list in JS.
 * The cached payload is id + name only.
 *
 * Uses the admin Supabase client so a single cache entry is
 * reusable across all callers (avoids cookie/auth-dependent cache
 * keys that would fragment per user). The returned data is not
 * sensitive — houses' names are already visible to every
 * authenticated user in the app today.
 */

export const HOUSES_ACTIVE_TAG = "houses:active";

export interface CachedHouse {
  id: string;
  name: string;
}

export const getCachedActiveHouses = unstable_cache(
  async (): Promise<CachedHouse[]> => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("houses")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    return (data ?? []) as CachedHouse[];
  },
  ["active-houses"],
  {
    tags: [HOUSES_ACTIVE_TAG],
    revalidate: 300,
  }
);
