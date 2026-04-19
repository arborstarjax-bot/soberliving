import { createClient } from "@/lib/supabase/server";

const CAP = 99;

/**
 * Async server component that renders the unread-notification badge
 * for the sidebar. Queries capped at CAP+1 rows instead of doing an
 * `count: "exact"` scan so the work is O(CAP) regardless of how many
 * unread notifications a user has accumulated.
 *
 * Rendered inside `<Suspense fallback={null}>` in the dashboard
 * layout so the sidebar paints immediately while this streams.
 */
export async function NotificationBadge({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("is_read", false)
    .limit(CAP + 1);

  const n = data?.length ?? 0;
  if (n === 0) return null;

  return (
    <span className="ml-auto text-xs font-bold text-yellow-400">
      +{n > CAP ? `${CAP}` : n}
    </span>
  );
}
