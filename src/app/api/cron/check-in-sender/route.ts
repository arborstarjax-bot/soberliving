import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getHouseToday } from "@/lib/timezone";

// Daily cron (morning): fires workspace check-in schedules.
// A schedule is { id, label, house_ids, frequency, day_of_week?, enabled,
// last_sent_on }. Daily sends every run; weekly sends when today's
// ET weekday matches day_of_week. last_sent_on dedupes.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Schedule {
  id: string;
  label?: string;
  house_ids?: string[];
  frequency?: string;
  day_of_week?: number;
  day_of_month?: number;
  enabled?: boolean;
  last_sent_on?: string;
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 503 }
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: settingsRows } = await admin
    .from("workspace_settings")
    .select("workspace_id, check_in_schedules, timezone");

  let sent = 0;
  for (const row of settingsRows ?? []) {
    // Each workspace's "today" and weekday come from its own timezone.
    const wsTz =
      (row.timezone as string | null) ?? "America/New_York";
    const today = getHouseToday(wsTz);
    const wsNow = new Date(
      new Date().toLocaleString("en-US", { timeZone: wsTz })
    );
    const weekday = wsNow.getDay();
    const schedules = (row.check_in_schedules as Schedule[] | null) ?? [];
    let changed = false;

    for (const sched of schedules) {
      if (!sched.enabled) continue;
      if (sched.last_sent_on === today) continue;
      const freq = sched.frequency ?? "weekly";
      const daysSinceLast = sched.last_sent_on
        ? (Date.parse(today) - Date.parse(sched.last_sent_on)) / 86400000
        : Infinity;
      if (freq === "weekly" && (sched.day_of_week ?? 1) !== weekday)
        continue;
      if (
        freq === "biweekly" &&
        ((sched.day_of_week ?? 1) !== weekday || daysSinceLast < 14)
      )
        continue;
      if (
        freq === "monthly" &&
        ((sched.day_of_month ?? 1) !== wsNow.getDate() || daysSinceLast < 27)
      )
        continue;
      // Only send to houses that actually belong to this workspace —
      // schedule house_ids are stored data, not proof of tenancy.
      const candidateIds = (sched.house_ids ?? []).filter(Boolean);
      if (candidateIds.length === 0) continue;
      const { data: ownHouses } = await admin
        .from("houses")
        .select("id")
        .eq("workspace_id", row.workspace_id)
        .in("id", candidateIds);
      const houseIds = (ownHouses ?? []).map((h) => h.id as string);
      if (houseIds.length === 0) continue;

      const { data: batch } = await admin
        .from("check_in_batches")
        .insert({
          created_by: null,
          house_ids: houseIds,
          workspace_id: row.workspace_id,
          schedule_id: sched.id,
        })
        .select("id")
        .single();
      if (!batch) continue;

      const { data: residents } = await admin
        .from("residents")
        .select("id, user_id, house_id")
        .in("house_id", houseIds)
        .eq("status", "active")
        .not("user_id", "is", null);

      if (residents && residents.length > 0) {
        await admin.from("check_in_responses").insert(
          residents.map((r) => ({
            batch_id: batch.id,
            resident_id: r.id,
            user_id: r.user_id!,
            house_id: r.house_id,
            status: "pending",
          }))
        );
        sent += residents.length;
      }
      sched.last_sent_on = today;
      changed = true;
    }

    if (changed) {
      await admin
        .from("workspace_settings")
        .update({ check_in_schedules: schedules })
        .eq("workspace_id", row.workspace_id);
    }
  }

  return NextResponse.json({ ok: true, sent });
}
