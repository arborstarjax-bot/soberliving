import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Find the oldest active blocker targeted at `userId` that they
 * haven't acknowledged. Returns `null` if none — most resident
 * sessions are on this path so it's the hot case.
 *
 * Targeting rules:
 *   - target_type='all'       → every active resident
 *   - target_type='house'     → resident whose active residents row's
 *                               house_id is in target_house_ids
 *   - target_type='residents' → userId listed in target_user_ids
 *
 * Archived (archived_at != null) blockers are ignored. Blockers the
 * user has already acknowledged (row in blocker_acknowledgments)
 * are ignored.
 *
 * Uses the admin client deliberately — the blockers / blocker_acknowledgments
 * tables have no resident-scoped SELECT RLS policy, same pattern as
 * house_commitments. See src/lib/auth.ts for why.
 */
export async function findPendingBlockerForUser(
  userId: string,
  adminClient?: SupabaseClient
): Promise<string | null> {
  const admin = adminClient ?? createAdminClient();

  // 1) Resolve this user's active house (if any) so we can match
  //    target_type='house' blockers. A resident without an active
  //    residents row can still be targeted via 'all' or 'residents'.
  const { data: residentRow } = await admin
    .from("residents")
    .select("house_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  const houseId = (residentRow?.house_id as string | null) ?? null;

  // 2) Pull active blockers ordered oldest-first so FIFO resolution
  //    surfaces the earliest pending message first. The result is
  //    bounded because blockers are admin-authored and low-volume;
  //    we filter in memory below so we can express the OR-of-OR
  //    targeting rules without a complex PostgREST query.
  const { data: blockers } = await admin
    .from("blockers")
    .select(
      "id, target_type, target_house_ids, target_user_ids, created_at"
    )
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (!blockers || blockers.length === 0) return null;

  const applicable = blockers.filter((b) => {
    const targetType = b.target_type as string;
    if (targetType === "all") return true;
    if (targetType === "house") {
      if (!houseId) return false;
      const arr = (b.target_house_ids as string[] | null) ?? [];
      return arr.includes(houseId);
    }
    if (targetType === "residents") {
      const arr = (b.target_user_ids as string[] | null) ?? [];
      return arr.includes(userId);
    }
    return false;
  });

  if (applicable.length === 0) return null;

  // 3) Drop the ones already acknowledged.
  const ids = applicable.map((b) => b.id as string);
  const { data: acks } = await admin
    .from("blocker_acknowledgments")
    .select("blocker_id")
    .eq("user_id", userId)
    .in("blocker_id", ids);
  const acked = new Set((acks ?? []).map((a) => a.blocker_id as string));

  for (const b of applicable) {
    if (!acked.has(b.id as string)) return b.id as string;
  }
  return null;
}
