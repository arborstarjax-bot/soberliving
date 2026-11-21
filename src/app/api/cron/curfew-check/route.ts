import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendWebPushToMany } from "@/lib/push";
import { getEffectiveHouseCurfews } from "@/lib/workspace";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

// Cron — runs every 15 minutes via Supabase pg_cron.
// Dynamically checks each house's curfew for the current day-of-week
// and sends a summary push to staff when residents are still out past
// curfew. Uses curfew_notification_log to avoid duplicate notifications
// for the same house on the same day.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AdminClient = ReturnType<typeof createAdminClient>;

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

async function getStaffForHouse(admin: AdminClient, houseId: string): Promise<string[]> {
  // Resolve the house's workspace so admins can be scoped to it — an
  // admin should only be notified about their own workspace's houses.
  const { data: houseRow } = await admin
    .from("houses")
    .select("workspace_id")
    .eq("id", houseId)
    .maybeSingle();
  const workspaceId = (houseRow?.workspace_id as string | null) ?? null;

  const adminsQuery = workspaceId
    ? admin
        .from("user_roles")
        .select("user_id, users!inner(workspace_id)")
        .eq("role", "admin")
        .eq("users.workspace_id", workspaceId)
    : admin.from("user_roles").select("user_id").eq("role", "admin");

  const [adminsRes, managersRes] = await Promise.all([
    adminsQuery,
    admin
      .from("manager_house_assignments")
      .select("user_id")
      .eq("house_id", houseId)
      .is("unassigned_at", null),
  ]);

  const ids = new Set<string>();
  for (const a of adminsRes.data ?? []) ids.add((a as { user_id: string }).user_id);
  for (const m of (managersRes as { data: { user_id: string }[] | null }).data ?? []) ids.add(m.user_id);
  return [...ids];
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const startedAt = Date.now();

  try {
    const admin = createAdminClient();
    const now = new Date();
    // Curfew math is per-house: each house's timezone decides its local
    // day name, date, and minutes-since-midnight.
    function houseLocal(timezone: string) {
      const local = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
      return {
        minutes: local.getHours() * 60 + local.getMinutes(),
        dayName: DAY_NAMES[local.getDay()],
        date: `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`,
      };
    }

    // Find all residents currently signed out (time_in IS NULL).
    const { data: openRows } = await admin
      .from("sign_out_sheet")
      .select("id, resident_id, house_id, destination, time_out, resident:residents!inner(full_name)")
      .is("time_in", null);

    if (!openRows || openRows.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        reason: "no_one_out",
        durationMs: Date.now() - startedAt,
      });
    }

    // Group open sign-outs by house.
    const byHouse = new Map<string, typeof openRows>();
    for (const row of openRows) {
      const existing = byHouse.get(row.house_id) ?? [];
      existing.push(row);
      byHouse.set(row.house_id, existing);
    }

    // Check which houses already received a curfew notification today.
    const houseIds = [...byHouse.keys()];
    // Bound to recent log rows — notification dedupe only compares the
    // house-local today/yesterday, and an unfiltered history scan would
    // eventually hit the API row cap and resend alerts.
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - 2);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    const { data: alreadySent } = await admin
      .from("curfew_notification_log")
      .select("house_id, notification_date")
      .gte("notification_date", cutoffDate)
      .in("house_id", houseIds);
    const sentKeys = new Set(
      (alreadySent ?? []).map(
        (r) => `${(r as { house_id: string }).house_id}:${(r as { notification_date: string }).notification_date}`
      )
    );

    const { data: houseRows } = await admin
      .from("houses")
      .select("id, workspace_id, timezone")
      .in("id", houseIds);
    const houseMeta = new Map(
      (houseRows ?? []).map((h) => [
        (h as { id: string }).id,
        {
          workspaceId: (h as { workspace_id?: string | null }).workspace_id ?? null,
          timezone:
            (h as { timezone?: string | null }).timezone ?? DEFAULT_TIMEZONE,
        },
      ])
    );

    let totalNotified = 0;

    for (const [houseId, rows] of byHouse) {
      const meta = houseMeta.get(houseId);
      const { minutes: currentMinutes, dayName: todayName, date: todayDate } =
        houseLocal(meta?.timezone ?? DEFAULT_TIMEZONE);

      // Skip if already notified on this house's local date.
      if (sentKeys.has(`${houseId}:${todayDate}`)) continue;

      const curfews = await getEffectiveHouseCurfews(houseId);
      const todayCurfew = curfews.find((c) => c.day_of_week === todayName);
      if (!todayCurfew) continue;

      // Parse curfew start time (when violations begin).
      const startTime = todayCurfew.curfew_start_time ?? todayCurfew.curfew_time;
      const [startH, startM] = startTime.split(":").map(Number);
      const curfewStartMinutes = startH * 60 + startM;

      // Only notify if we're currently past curfew start.
      if (currentMinutes < curfewStartMinutes) continue;

      // All residents still signed out in this house are past curfew.
      const names = rows.map((r) => {
        const resident = r.resident as unknown as { full_name: string };
        return `${resident.full_name} (${r.destination})`;
      });

      if (names.length === 0) continue;

      const staffIds = await getStaffForHouse(admin, houseId);
      if (staffIds.length === 0) continue;

      const summary = names.length <= 5
        ? names.join(", ")
        : `${names.slice(0, 5).join(", ")} +${names.length - 5} more`;

      await sendWebPushToMany(staffIds, "curfew_violation_staff", {
        title: `⚠️ ${names.length} Resident${names.length > 1 ? "s" : ""} Out Past Curfew`,
        body: summary,
        url: "/sign-out-sheet",
      });

      // Auto-demerit residents still out past curfew when the
      // workspace enabled it (one per resident per day via dedupe).
      const wsId = meta?.workspaceId ?? null;
      if (wsId) {
        const { data: wsRow } = await admin
          .from("workspace_settings")
          .select("auto_demerit_missed_curfew")
          .eq("workspace_id", wsId)
          .maybeSingle();
        if (wsRow?.auto_demerit_missed_curfew) {
          for (const row of rows) {
            const reason = `Missed curfew on ${todayDate}`;
            const { data: dup } = await admin
              .from("demerits")
              .select("id")
              .eq("resident_id", row.resident_id)
              .eq("reason", reason)
              .limit(1);
            if (dup && dup.length > 0) continue;
            await admin.from("demerits").insert({
              resident_id: row.resident_id,
              house_id: houseId,
              points: 1,
              reason,
              category: "Missed Curfew",
              issued_by: null,
            });
          }
        }
      }

      // Record that we sent a notification for this house today.
      await admin.from("curfew_notification_log").insert({
        house_id: houseId,
        notification_date: todayDate,
        residents_notified: names.length,
      });

      totalNotified += names.length;
    }

    return NextResponse.json({
      ok: true,
      sent: totalNotified,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/curfew-check] failed", msg);
    return NextResponse.json(
      { ok: false, error: msg, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}
