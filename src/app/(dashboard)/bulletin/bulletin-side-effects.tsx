import { createAdminClient } from "@/lib/supabase/server";
import { ensureMilestonePosts } from "@/lib/sobriety-milestones";

/**
 * Fire-and-forget side effects for the Bulletin page:
 *  - bump the user's `last_seen_bulletin_at` so the sidebar unread
 *    badge clears
 *  - post auto-congrats for any resident who has crossed a new
 *    sobriety milestone since the last render
 *
 * Rendered inside a `<Suspense fallback={null}>` island so the page
 * shell streams to the browser without waiting on either operation.
 * Returns no visible UI.
 */
export async function BulletinSideEffects({ userId }: { userId: string }) {
  const supabase = createAdminClient();
  await Promise.all([
    supabase
      .from("users")
      .update({ last_seen_bulletin_at: new Date().toISOString() })
      .eq("id", userId),
    ensureMilestonePosts(supabase),
  ]);
  return null;
}
