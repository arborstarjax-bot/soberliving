import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * After a resident acknowledges a blocker, check whether every
 * targeted resident has now acked and — if so — set `archived_at`
 * so the Notices list auto-archives fulfilled entries and they no
 * longer appear under Active Notices.
 *
 * Idempotent: a retry won't re-archive an already-archived row
 * because we `.is('archived_at', null)` before the update.
 *
 * Safe to call after every ack; target counts are cheap for the
 * 'residents' / 'house' targeting modes and bounded by the active
 * residents table for 'all'.
 */
export async function maybeAutoArchiveBlocker(
  blockerId: string,
  adminClient?: SupabaseClient
): Promise<{ archived: boolean }> {
  const admin = adminClient ?? createAdminClient();

  const { data: blocker } = await admin
    .from("blockers")
    .select(
      "id, archived_at, target_type, target_house_ids, target_user_ids"
    )
    .eq("id", blockerId)
    .maybeSingle();
  if (!blocker || blocker.archived_at) return { archived: false };

  const targetType = blocker.target_type as string;

  // Compute the set of active-resident user_ids this blocker targets.
  let targetUserIds: string[] = [];
  if (targetType === "all") {
    const { data: rows } = await admin
      .from("residents")
      .select("user_id")
      .eq("status", "active");
    targetUserIds = (rows ?? []).map((r) => r.user_id as string);
  } else if (targetType === "house") {
    const hids = (blocker.target_house_ids as string[] | null) ?? [];
    if (hids.length === 0) return { archived: false };
    const { data: rows } = await admin
      .from("residents")
      .select("user_id")
      .eq("status", "active")
      .in("house_id", hids);
    targetUserIds = (rows ?? []).map((r) => r.user_id as string);
  } else if (targetType === "residents") {
    targetUserIds = (blocker.target_user_ids as string[] | null) ?? [];
  } else {
    return { archived: false };
  }

  if (targetUserIds.length === 0) return { archived: false };

  const { data: acks } = await admin
    .from("blocker_acknowledgments")
    .select("user_id")
    .eq("blocker_id", blockerId)
    .in("user_id", targetUserIds);
  const acked = new Set((acks ?? []).map((a) => a.user_id as string));
  const allAcked = targetUserIds.every((id) => acked.has(id));
  if (!allAcked) return { archived: false };

  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("blockers")
    .update({ archived_at: nowIso, updated_at: nowIso })
    .eq("id", blockerId)
    .is("archived_at", null);
  if (error) return { archived: false };
  return { archived: true };
}

/**
 * Checks whether a specific blocker row is targeted at `userId` per
 * its `target_type` + `target_house_ids` / `target_user_ids` config.
 *
 * Server-side authorization gate for any action that mutates on
 * behalf of a resident — e.g. `acknowledgeBlocker`. The /acknowledge/[id]
 * page has the same check for the redirect gate, but a `"use server"`
 * action can be invoked directly via POST, so the action must
 * re-verify.
 */
export async function isBlockerApplicableToUser(
  blockerId: string,
  userId: string,
  adminClient?: SupabaseClient
): Promise<boolean> {
  const admin = adminClient ?? createAdminClient();

  const { data: blocker } = await admin
    .from("blockers")
    .select(
      "id, archived_at, target_type, target_house_ids, target_user_ids"
    )
    .eq("id", blockerId)
    .maybeSingle();
  if (!blocker || blocker.archived_at) return false;

  const targetType = blocker.target_type as string;
  if (targetType === "all") return true;
  if (targetType === "residents") {
    const arr = (blocker.target_user_ids as string[] | null) ?? [];
    return arr.includes(userId);
  }
  if (targetType === "house") {
    const arr = (blocker.target_house_ids as string[] | null) ?? [];
    if (arr.length === 0) return false;
    const { data: residentRow } = await admin
      .from("residents")
      .select("house_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    const houseId = (residentRow?.house_id as string | null) ?? null;
    return houseId !== null && arr.includes(houseId);
  }
  return false;
}

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
