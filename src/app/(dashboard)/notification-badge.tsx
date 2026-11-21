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
    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
      {n > CAP ? `${CAP}+` : n}
    </span>
  );
}
