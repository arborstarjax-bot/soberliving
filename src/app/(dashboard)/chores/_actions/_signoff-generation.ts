import type { createClient } from "@/lib/supabase/server";
import { getHouseToday, DEFAULT_TIMEZONE, addCalendarDays } from "@/lib/timezone";

// Day-of-week → offset from the rotation's cycle_start_date.
// Rotations start on Monday by convention (enforced by the start
// dialog), so Monday is offset 0.
const DAY_TO_OFFSET: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/**
 * Rebuilds future `chore_signoffs` for every current-rotation
 * assignment of a given chore based on the chore's (possibly just
 * updated) `days_of_week` and `cycle_weeks`.
 *
 * History is preserved: past signoffs and any signoff for today
 * that's already been acted on (anything other than `pending` /
 * `redo`) are left alone. Pending/redo signoffs dated today or later
 * are deleted and recreated from the new schedule, so that:
 *
 * - Editing a chore from Sunday → Monday immediately removes the
 *   bogus Sunday "due today" tile and inserts the correct Monday
 *   one.
 * - Shortening `cycle_weeks` prunes orphaned future-week signoffs.
 * - Lengthening `cycle_weeks` backfills the missing future weeks.
 *
 * Caller is responsible for permission checks and `revalidatePath`.
 */
export async function regenerateFutureSignoffsForChore(
  supabase: SupabaseServer,
  choreId: string
): Promise<void> {
  const { data: chore } = await supabase
    .from("chores")
    .select("house_id, days_of_week, cycle_weeks")
    .eq("id", choreId)
    .maybeSingle();

  if (!chore) return;

  const choreDays: string[] = (chore.days_of_week as string[]) ?? [];
  const cycleWeeks: number = (chore.cycle_weeks as number) ?? 2;

  const { data: houseRow } = await supabase
    .from("houses")
    .select("timezone")
    .eq("id", chore.house_id)
    .maybeSingle();
  const todayStr = getHouseToday(
    (houseRow?.timezone as string | undefined) ?? DEFAULT_TIMEZONE
  );

  // Current-rotation assignments of this chore only. Historical
  // rotations stay untouched — their signoffs are the record of what
  // actually happened under the old schedule.
  const { data: assignments } = await supabase
    .from("chore_rotation_assignments")
    .select(
      "id, rotation:chore_rotations!inner(cycle_start_date, is_current)"
    )
    .eq("chore_id", choreId)
    .eq("rotation.is_current", true);

  if (!assignments || assignments.length === 0) return;

  for (const raw of assignments) {
    const row = raw as unknown as {
      id: string;
      rotation: { cycle_start_date: string; is_current: boolean } | null;
    };
    const cycleStartDate = row.rotation?.cycle_start_date;
    if (!cycleStartDate) continue;

    // Drop pending/redo signoffs for today-or-later; keep completed /
    // completed_pending_review / rejected / missed / any past pending
    // rows (the missed-chore job will flip past pendings to missed
    // next time it runs).
    await supabase
      .from("chore_signoffs")
      .delete()
      .eq("rotation_assignment_id", row.id)
      .gte("sign_off_date", todayStr)
      .in("status", ["pending", "redo"]);

    // Fetch whatever we just left behind so we don't insert duplicate
    // (rotation_assignment_id, sign_off_date) pairs if a residual
    // signoff for that day is already there (e.g. a completed Monday
    // signoff when re-adding Monday to the schedule).
    const { data: existing } = await supabase
      .from("chore_signoffs")
      .select("sign_off_date")
      .eq("rotation_assignment_id", row.id);
    const existingDates = new Set(
      (existing ?? []).map((e) => e.sign_off_date as string)
    );

    // Pure UTC-string date arithmetic. Previously used `new Date(str)` +
    // date-fns `addDays` + `format`, which silently shifted the result
    // by a day whenever the runtime's local TZ was not UTC — producing
    // rows like { sign_off_date: '2026-04-19', day_of_week: 'monday' }
    // where Apr 19 was actually a Sunday. `addCalendarDays` is
    // TZ-independent so the string and the name always agree.
    const signoffs: Array<{
      rotation_assignment_id: string;
      sign_off_date: string;
      day_of_week: string;
      week_number: number;
      status: string;
    }> = [];

    for (let weekNum = 1; weekNum <= cycleWeeks; weekNum++) {
      const weekOffset = (weekNum - 1) * 7;
      for (const day of choreDays) {
        const offset = DAY_TO_OFFSET[day];
        if (offset === undefined) continue;
        const signoffDateStr = addCalendarDays(
          cycleStartDate,
          weekOffset + offset
        );
        // Never create signoffs for past days — see the comment in
        // assignRotationChore. Today is fair game.
        if (signoffDateStr < todayStr) continue;
        if (existingDates.has(signoffDateStr)) continue;
        signoffs.push({
          rotation_assignment_id: row.id,
          sign_off_date: signoffDateStr,
          day_of_week: day,
          week_number: weekNum,
          status: "pending",
        });
      }
    }

    if (signoffs.length > 0) {
      await supabase.from("chore_signoffs").insert(signoffs);
    }
  }
}
