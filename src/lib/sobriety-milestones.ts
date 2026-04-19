import { differenceInDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sobriety milestones that auto-generate a congratulatory bulletin
 * post when crossed. Ordered ascending. The first six match the chip
 * color tiers (see src/components/sobriety-chip.tsx); after 365 days
 * we keep posting on every subsequent full-year anniversary (2y, 3y,
 * 4y, …) generated dynamically in `milestonesPassed`.
 */
const FIXED_MILESTONES: { days: number; label: string }[] = [
  { days: 30, label: "30 days sober" },
  { days: 60, label: "60 days sober" },
  { days: 90, label: "90 days sober" },
  { days: 182, label: "6 months sober" },
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

// In-memory debounce — avoid running the residents→milestones scan
// on every single bulletin render. A single entry per process is
// enough because the check is idempotent (UNIQUE constraint).
let lastRunAt = 0;
const MIN_INTERVAL_MS = 60_000; // 1 minute

/**
 * Scan all active residents with a sobriety_date, post a celebratory
 * bulletin entry for every milestone they've crossed that hasn't
 * been posted yet, and log it in `sobriety_milestone_posts`. Safe
 * to call from any server render — all writes are idempotent via
 * the UNIQUE(resident_user_id, milestone_days) constraint.
 *
 * Returns the number of new posts created on this call.
 */
export async function ensureMilestonePosts(
  admin: SupabaseClient,
): Promise<number> {
  const now = Date.now();
  if (now - lastRunAt < MIN_INTERVAL_MS) return 0;
  lastRunAt = now;

  const { data: residents } = await admin
    .from("residents")
    .select(
      "user_id, house_id, sobriety_date, user:users!inner(full_name)",
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

    // For a newly-added resident (no prior milestone log) that is
    // already past multiple milestones, only announce the highest
    // one. Silently log the lower tiers so future runs don't spam
    // the feed with backfilled milestones the house missed. After
    // this first run the user is "established" and subsequent
    // milestone crossings fire normally.
    const isNew = !establishedUsers.has(r.user_id);
    const highest = needed[needed.length - 1];
    const toAnnounce = isNew && needed.length > 1 ? [highest] : needed;
    const toSilentlyLog = isNew && needed.length > 1
      ? needed.slice(0, -1)
      : [];

    for (const days of toSilentlyLog) {
      await admin
        .from("sobriety_milestone_posts")
        .insert({
          resident_user_id: r.user_id,
          milestone_days: days,
          bulletin_post_id: null,
        });
    }

    for (const days of toAnnounce) {
      const label = milestoneLabel(days);
      const { data: inserted, error: postErr } = await admin
        .from("bulletin_posts")
        .insert({
          author_id: r.user_id,
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
