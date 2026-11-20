import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { addCalendarDays } from "@/lib/timezone";

// Minimal structural type so both the request-scoped client and the
// service-role admin client work here.
type Db = Pick<SupabaseClient, "from">;

export type RotationChore = {
  id: string;
  name: string;
  days_of_week: string[] | null;
  cycle_weeks: number | null;
};

// Weekday names indexed by getUTCDay() so a signoff's stored
// `day_of_week` always matches the actual weekday of `sign_off_date`
// — even when a cycle starts mid-week (daily/monthly auto-cycles).
const WEEKDAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
];
function weekdayName(isoDate: string): string {
  return WEEKDAY_NAMES[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
}

/**
 * Build a fair chore_id -> resident_id assignment map for a house.
 *
 * Fairness rules (vs. the old "shift residents already on chores"):
 * - The pool is ALL active residents in the house, not just residents
 *   who had chores last cycle.
 * - Chores are dealt greedily to the eligible resident with the fewest
 *   assignments so counts differ by at most one.
 * - Ties prefer residents who had fewer chores last cycle — so when
 *   chores outnumber residents, who picks up the extra rotates, and
 *   when residents outnumber chores, who sits out rotates.
 * - Resident-level and room-level exclusions are always respected; a
 *   chore with no eligible resident is left unassigned.
 */
export async function buildFairAssignments(
  supabase: Db,
  houseId: string,
  opts: { onlyChoreIds?: string[] } = {}
): Promise<Map<string, string>> {
  const assignments = new Map<string, string>();

  let choresQuery = supabase
    .from("chores")
    .select("id, name, days_of_week, cycle_weeks")
    .eq("house_id", houseId)
    .eq("is_active", true)
    .order("name");
  if (opts.onlyChoreIds) {
    if (opts.onlyChoreIds.length === 0) return assignments;
    choresQuery = choresQuery.in("id", opts.onlyChoreIds);
  }
  const { data: chores } = await choresQuery;
  const choreList = (chores ?? []) as RotationChore[];
  if (choreList.length === 0) return assignments;

  const { data: residents } = await supabase
    .from("residents")
    .select("id")
    .eq("house_id", houseId)
    .eq("status", "active")
    .order("created_at");
  const residentIds = (residents ?? []).map((r: { id: string }) => r.id);
  if (residentIds.length === 0) return assignments;

  const choreIds = choreList.map((c) => c.id);

  // Exclusions: resident-level + room-level (resident's current bed).
  const { data: exclusions } = await supabase
    .from("chore_exclusions")
    .select("chore_id, resident_id")
    .in("chore_id", choreIds);
  const exclusionSet = new Set(
    (exclusions ?? []).map((e: { chore_id: string; resident_id: string }) => `${e.chore_id}:${e.resident_id}`)
  );

  const { data: roomExclusions } = await supabase
    .from("chore_room_exclusions")
    .select("chore_id, room_id")
    .in("chore_id", choreIds);
  if (roomExclusions && roomExclusions.length > 0) {
    const { data: beds } = await supabase
      .from("bed_assignments")
      .select("resident_id, bed:beds(room_id)")
      .in("resident_id", residentIds)
      .is("end_date", null);
    const roomByResident = new Map<string, string>();
    for (const row of (beds ?? []) as unknown as { resident_id: string; bed: { room_id: string } | null }[]) {
      if (row.bed?.room_id) roomByResident.set(row.resident_id, row.bed.room_id);
    }
    for (const rx of roomExclusions as { chore_id: string; room_id: string }[]) {
      for (const [resId, roomId] of roomByResident) {
        if (roomId === rx.room_id) exclusionSet.add(`${rx.chore_id}:${resId}`);
      }
    }
  }

  // Previous cycle's assignment counts + order, for the rotation tie-break.
  const prevCount = new Map<string, number>();
  const prevOrder = new Map<string, number>();
  const { data: prevRotation } = await supabase
    .from("chore_rotations")
    .select("id")
    .eq("house_id", houseId)
    .eq("is_current", true)
    .maybeSingle();
  if (prevRotation) {
    const { data: prevAssigns } = await supabase
      .from("chore_rotation_assignments")
      .select("resident_id")
      .eq("rotation_id", prevRotation.id)
      .order("created_at");
    (prevAssigns ?? []).forEach((a: { resident_id: string }, i: number) => {
      prevCount.set(a.resident_id, (prevCount.get(a.resident_id) ?? 0) + 1);
      if (!prevOrder.has(a.resident_id)) prevOrder.set(a.resident_id, i);
    });
  }
  const orderOf = (residentId: string, fallback: number) =>
    prevOrder.get(residentId) ?? prevOrder.size + fallback;

  const count = new Map<string, number>();
  for (const chore of choreList) {
    const eligible = residentIds
      .filter((id) => !exclusionSet.has(`${chore.id}:${id}`))
      .map((id, i) => ({ id, i }))
      .sort(
        (a, b) =>
          (count.get(a.id) ?? 0) - (count.get(b.id) ?? 0) ||
          (prevCount.get(a.id) ?? 0) - (prevCount.get(b.id) ?? 0) ||
          orderOf(a.id, a.i) - orderOf(b.id, b.i)
      );
    const pick = eligible[0];
    if (!pick) continue;
    assignments.set(chore.id, pick.id);
    count.set(pick.id, (count.get(pick.id) ?? 0) + 1);
  }
  return assignments;
}

/**
 * Generate pending signoff rows for an assignment.
 *
 * Walks the actual calendar days of the cycle so every row's
 * `day_of_week` matches the real weekday of `sign_off_date` and no
 * rows are created past `cycleEndDate`. `chore.cycle_weeks` caps how
 * far out rows go when no end date is given; when it is, the
 * rotation boundary wins (a daily cycle never gets week-long
 * obligations, a monthly one isn't truncated at 2 weeks).
 */
export function buildSignoffRows(
  rotationAssignmentId: string,
  cycleStartDate: string,
  chore: Pick<RotationChore, "days_of_week" | "cycle_weeks">,
  skipBeforeDate?: string,
  cycleEndDate?: string
) {
  const days = new Set(
    chore.days_of_week ?? ["monday", "wednesday", "friday"]
  );
  const spanDays = chore.cycle_weeks
    ? chore.cycle_weeks * 7
    : cycleEndDate
      ? undefined
      : 14;
  const rows = [];
  let offset = 0;
  // Iterate at most `spanDays` days from the start; when undefined,
  // the loop is bounded by cycleEndDate instead.
  while (spanDays === undefined || offset < spanDays) {
    const signOffDate = addCalendarDays(cycleStartDate, offset);
    if (cycleEndDate && signOffDate > cycleEndDate) break;
    if (days.has(weekdayName(signOffDate))) {
      if (!skipBeforeDate || signOffDate >= skipBeforeDate) {
        rows.push({
          rotation_assignment_id: rotationAssignmentId,
          sign_off_date: signOffDate,
          day_of_week: weekdayName(signOffDate),
          week_number: Math.floor(offset / 7) + 1,
          status: "pending",
        });
      }
    }
    offset++;
    if (offset > 400) break; // safety bound
  }
  return rows;
}

/**
 * Archive the house's current rotation and start a new one with
 * fairly-distributed assignments across all active chores/residents.
 * Shared by the staff "New Rotation" action and the auto-cycle cron
 * (actorId/actorName are null for the cron path).
 */
export async function performRotation(
  supabase: Db,
  opts: {
    houseId: string;
    cycleStartDate: string;
    actorId: string | null;
    actorName: string;
    assignChores: boolean;
    cycleLengthDays?: number;
  }
): Promise<{ rotationId?: string; error?: string }> {
  const { houseId, cycleStartDate, actorId, actorName, assignChores } = opts;
  const cycleLengthDays = opts.cycleLengthDays;

  await supabase
    .from("chore_rotations")
    .update({ is_current: false })
    .eq("house_id", houseId)
    .eq("is_current", true);

  const { data: houseChores } = await supabase
    .from("chores")
    .select("id, name, days_of_week, cycle_weeks")
    .eq("house_id", houseId)
    .eq("is_active", true);
  const choreList = (houseChores ?? []) as RotationChore[];
  const maxCycleWeeks = choreList.length > 0
    ? Math.max(...choreList.map((c) => c.cycle_weeks ?? 2))
    : 2;

  const cycleEndDate = addCalendarDays(
    cycleStartDate,
    cycleLengthDays && cycleLengthDays > 0
      ? cycleLengthDays - 1
      : maxCycleWeeks * 7 - 1
  );

  const { data: rotation, error } = await supabase
    .from("chore_rotations")
    .insert({
      house_id: houseId,
      cycle_start_date: cycleStartDate,
      cycle_end_date: cycleEndDate,
      is_current: true,
      created_by: actorId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (assignChores && choreList.length > 0) {
    const fair = await buildFairAssignments(supabase, houseId);
    const choreById = new Map(choreList.map((c) => [c.id, c]));
    for (const [choreId, residentId] of fair) {
      const { data: assignment } = await supabase
        .from("chore_rotation_assignments")
        .insert({
          rotation_id: rotation.id,
          chore_id: choreId,
          resident_id: residentId,
          assigned_by: actorId,
        })
        .select("id")
        .single();
      if (!assignment) continue;
      const chore = choreById.get(choreId);
      if (!chore) continue;
      const rows = buildSignoffRows(
        assignment.id,
        cycleStartDate,
        chore,
        undefined,
        cycleEndDate
      );
      if (rows.length > 0) await supabase.from("chore_signoffs").insert(rows);
    }
  }

  const { error: logError } = await supabase.from("activity_log").insert({
    house_id: houseId,
    actor_id: actorId,
    event_type: "rotation_created",
    entity_type: "chore_rotation",
    entity_id: rotation.id,
    description: `New ${maxCycleWeeks}-week chore rotation started by ${actorName} (${cycleStartDate})${assignChores ? " — residents fairly rotated" : ""}`,
  });
  if (logError) console.error("Failed to log rotation activity:", logError);

  return { rotationId: rotation.id };
}
