import { differenceInDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sobriety milestones that auto-generate a congratulatory bulletin
 * post when crossed. Ordered ascending and aligned with the chip
 * color tiers (see src/components/sobriety-chip.tsx). After 365 days
 * we keep posting on every subsequent full-year anniversary (2y, 3y,
 * 4y, …) generated dynamically in `milestonesPassed`.
 */
const FIXED_MILESTONES: { days: number; label: string }[] = [
  { days: 30, label: "30 days sober" },
  { days: 60, label: "60 days sober" },
  { days: 90, label: "90 days sober" },
  { days: 182, label: "6 months sober" },
  { days: 273, label: "9 months sober" },
  { days: 365, label: "1 year sober" },
];

export function milestoneLabel(days: number): string {
  const fixed = FIXED_MILESTONES.find((m) => m.days === days);
  if (fixed) return fixed.label;
  if (days >= 365 && days % 365 === 0) {
    return `${days / 365} years sober`;
  }
  return `${days} days sober`;
}

/**
 * Return every milestone `days` value a resident with the given start
 * date has already reached, ordered ascending. Yearly anniversaries
 * are emitted for each full year at/beyond day 365. Empty array if
 * the date is missing, in the future, or unparseable.
 */
export function milestonesPassed(sobrietyDate: string | null): number[] {
  if (!sobrietyDate) return [];
  const start = new Date(sobrietyDate);
  if (Number.isNaN(start.getTime())) return [];
  const days = differenceInDays(new Date(), start);
  if (days < 30) return [];

  const out: number[] = [];
  for (const m of FIXED_MILESTONES) {
    if (days >= m.days) out.push(m.days);
  }
  // Every subsequent year (2y, 3y, …) after the 1-year fixed entry.
  for (let year = 2; year * 365 <= days; year++) {
    out.push(year * 365);
  }
  return out;
}

// Cross-process debounce key used against public.system_flags. A
// module-global in-memory timestamp won't survive lambda cold starts
// (every fresh process would re-run the full residents→milestones
// scan once), so we do a compare-and-swap on a DB row instead.
const DEBOUNCE_KEY = "milestone_scan_last_run_at";
const MIN_INTERVAL = "1 minute";

/**
 * Scan all active residents with a sobriety_date, post a celebratory
 * bulletin entry for every milestone they've crossed that hasn't
 * been posted yet, and log it in `sobriety_milestone_posts`. Safe
 * to call from any server render — all writes are idempotent via
 * the UNIQUE(resident_user_id, milestone_days) constraint.
 *
 * Cross-process debounced via public.system_flags: only the first
 * caller in any given MIN_INTERVAL window actually runs the scan;
 * the rest short-circuit. The CAS uses an atomic UPSERT so racing
 * processes can't both win the window.
 *
 * Returns the number of new posts created on this call.
 */
export async function ensureMilestonePosts(
  admin: SupabaseClient,
): Promise<number> {
  // Atomic compare-and-swap: insert the flag if missing, or update
  // it if the stored timestamp is older than MIN_INTERVAL ago. PG
  // returns the row only when the WHERE clause on the DO UPDATE
  // branch matches — so an empty result set means another process
  // already owns this scan window and we should bail.
  const { data: claim, error: claimErr } = await admin.rpc(
    "claim_debounce_slot",
    { p_key: DEBOUNCE_KEY, p_interval: MIN_INTERVAL },
  );
  // If the RPC itself errored (e.g. migration not yet deployed), err
  // on the side of running the scan — the idempotent UNIQUE
  // constraint on sobriety_milestone_posts still prevents duplicates.
  if (!claimErr && claim === false) return 0;

  const { data: residents } = await admin
    .from("residents")
    .select(
      "user_id, house_id, sobriety_date, user:users!inner(full_name), house:houses!inner(workspace_id)",
    )
    .eq("status", "active")
    .not("sobriety_date", "is", null)
    .not("house_id", "is", null);

  if (!residents || residents.length === 0) return 0;

  type ResidentRow = {
    user_id: string;
    house_id: string;
    sobriety_date: string;
    user: { full_name: string } | { full_name: string }[] | null;
    house: { workspace_id: string | null } | { workspace_id: string | null }[] | null;
  };
  const rows = residents as unknown as ResidentRow[];

  const userIds = rows.map((r) => r.user_id);
  const { data: alreadyPosted } = await admin
    .from("sobriety_milestone_posts")
    .select("resident_user_id, milestone_days")
    .in("resident_user_id", userIds);

  const loggedKey = new Set(
    (alreadyPosted ?? []).map(
      (r) => `${r.resident_user_id}:${r.milestone_days}`,
    ),
  );

  // Residents that already have at least one logged milestone —
  // they are "established" and should receive a post for every
  // new milestone they cross going forward.
  const establishedUsers = new Set(
    (alreadyPosted ?? []).map((r) => r.resident_user_id as string),
  );

  // Only announce a milestone if the resident is within GRACE_DAYS
  // of actually crossing it today. Anything older gets silent-logged
  // (the avatar / profile chip still upgrades — we just don't fire a
  // stale "🎉 X hit 30 days!" post days or weeks after the fact).
  //
  // This covers three scenarios with one rule:
  //   1. Brand-new resident added with a long-past sobriety_date →
  //      every passed milestone is > GRACE_DAYS old → silent-log all,
  //      announce none.
  //   2. Established resident who crosses a milestone today and
  //      someone opens Bulletin the same day → within grace →
  //      announce.
  //   3. Established resident who crossed a milestone but nobody
  //      opened Bulletin for several days → past grace → silent-log.
  //      (Prevents posting a stale congrats dated today.)
  const GRACE_DAYS = 2;

  let created = 0;
  for (const r of rows) {
    const passed = milestonesPassed(r.sobriety_date);
    const needed = passed.filter(
      (d) => !loggedKey.has(`${r.user_id}:${d}`),
    );
    if (needed.length === 0) continue;

    const authorName = Array.isArray(r.user)
      ? r.user[0]?.full_name ?? "Resident"
      : r.user?.full_name ?? "Resident";

    const daysSober = differenceInDays(
      new Date(),
      new Date(r.sobriety_date),
    );

    const toAnnounce: number[] = [];
    const toSilentlyLog: number[] = [];
    for (const d of needed) {
      if (daysSober - d <= GRACE_DAYS) {
        toAnnounce.push(d);
      } else {
        toSilentlyLog.push(d);
      }
    }
    // `establishedUsers` is retained for future diagnostics but no
    // longer gates the announce/silent-log split — the grace window
    // is strictly date-based.
    void establishedUsers;

    for (const days of toSilentlyLog) {
      await admin
        .from("sobriety_milestone_posts")
        .insert({
          resident_user_id: r.user_id,
          milestone_days: days,
          bulletin_post_id: null,
        });
    }

    const houseObj = Array.isArray(r.house) ? r.house[0] : r.house;
    const workspaceId = houseObj?.workspace_id ?? null;

    for (const days of toAnnounce) {
      const label = milestoneLabel(days);
      const { data: inserted, error: postErr } = await admin
        .from("bulletin_posts")
        .insert({
          author_id: r.user_id,
          workspace_id: workspaceId,
          house_id: r.house_id,
          title: `🎉 ${authorName} — ${label}!`,
          content: `Big congrats to ${authorName} on reaching ${label}. Keep going strong 💪`,
          post_type: "standard",
        })
        .select("id")
        .single();
      if (postErr || !inserted) continue;

      const { error: logErr } = await admin
        .from("sobriety_milestone_posts")
        .insert({
          resident_user_id: r.user_id,
          milestone_days: days,
          bulletin_post_id: inserted.id,
        });
      if (logErr) {
        // Unique violation = another process beat us to it. Clean
        // up the orphan bulletin row so we don't show a duplicate.
        await admin.from("bulletin_posts").delete().eq("id", inserted.id);
        continue;
      }
      created++;
    }
  }

  return created;
}
