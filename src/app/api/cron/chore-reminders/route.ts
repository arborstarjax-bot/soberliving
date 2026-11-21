import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendWebPush, sendWebPushToMany } from "@/lib/push";
import { getHouseToday, DEFAULT_TIMEZONE, addCalendarDays } from "@/lib/timezone";
import { performRotation } from "@/lib/chore-rotation";

// Vercel Cron — runs daily at noon and 10 PM Eastern (16:00 & 02:00 UTC).
//
// At noon: sends a "chore is due today" reminder.
// At 10 PM: sends an urgent "chore must be completed" reminder.
//
// Both only fire for chores that are still pending or need redo.
// Auth: CRON_SECRET bearer token.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AdminClient = ReturnType<typeof createAdminClient>;

// Staff to notify about missed chores in a single workspace: admins of
// that workspace plus managers assigned to the affected houses. Admins
// are scoped by workspace_id so one workspace's staff never sees another
// workspace's residents in the summary.
async function getStaffForWorkspace(
  admin: AdminClient,
  workspaceId: string | null,
  affectedHouseIds: string[]
): Promise<string[]> {
  // Fail closed: no workspace means no safe tenant to scope staff to —
  // never fall back to platform-wide admins.
  if (!workspaceId) {
    const { data: managers } = affectedHouseIds.length > 0
      ? await admin
          .from("manager_house_assignments")
          .select("user_id")
          .in("house_id", affectedHouseIds)
          .is("unassigned_at", null)
      : { data: [] as { user_id: string }[] };
    return [...new Set((managers ?? []).map((m) => m.user_id))];
  }

  const [adminsRes, managersRes] = await Promise.all([
    admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .in("role", ["owner", "admin", "manager"]),
    affectedHouseIds.length > 0
      ? admin
          .from("manager_house_assignments")
          .select("user_id")
          .in("house_id", affectedHouseIds)
          .is("unassigned_at", null)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);

  const ids = new Set<string>();
  for (const a of adminsRes.data ?? []) ids.add((a as { user_id: string }).user_id);
  for (const m of (managersRes as { data: { user_id: string }[] | null }).data ?? []) ids.add(m.user_id);
  return [...ids];
}

function getEasternHour(): number {
  const now = new Date();
  const eastern = now.toLocaleString("en-US", {
    timeZone: DEFAULT_TIMEZONE,
    hour: "numeric",
    hour12: false,
  });
  return parseInt(eastern, 10);
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
  const easternHour = getEasternHour();

  // Determine message variant based on time of day.
  // 10 AM – 4 PM → noon reminder; 6 PM – 2 AM → evening "must complete" reminder.
  const isEvening = easternHour >= 18 || easternHour < 4;

  try {
    const admin = createAdminClient();
    const today = getHouseToday(DEFAULT_TIMEZONE);
    const nowInTz = new Date(
      new Date().toLocaleString("en-US", { timeZone: DEFAULT_TIMEZONE })
    );
    const weekStart = new Date(nowInTz);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const mondayIso = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;

    // Auto-cycle: when a workspace enables it, a house whose current
    // rotation has ended gets a fresh fairly-dealt rotation. Starts the
    // day after the old cycle (or today, if the cron was off long enough
    // that starting back then would be in the past).
    let autoCycled = 0;
    const { data: endedRotations } = await admin
      .from("chore_rotations")
      .select("id, house_id, cycle_end_date, house:houses(workspace_id, timezone)")
      .eq("is_current", true)
      .lt("cycle_end_date", today);

    for (const rot of endedRotations ?? []) {
      const house = rot.house as unknown as {
        workspace_id: string | null;
        timezone: string | null;
      } | null;
      if (!house?.workspace_id) continue;
      const { data: ws } = await admin
        .from("workspace_settings")
        .select("auto_cycle_chores, auto_cycle_frequency")
        .eq("workspace_id", house.workspace_id)
        .maybeSingle();
      if (!ws?.auto_cycle_chores) continue;

      const houseToday = getHouseToday(house.timezone ?? DEFAULT_TIMEZONE);
      if ((rot.cycle_end_date as string) >= houseToday) continue;
      const nextStart = addCalendarDays(rot.cycle_end_date as string, 1);
      const cycleStart = nextStart > houseToday ? nextStart : houseToday;

      const freqDays: Record<string, number> = {
        daily: 1,
        weekly: 7,
        biweekly: 14,
        monthly: 28,
      };
      const result = await performRotation(admin, {
        houseId: rot.house_id,
        cycleStartDate: cycleStart,
        actorId: null,
        actorName: "auto-cycle",
        assignChores: true,
        cycleLengthDays:
          freqDays[(ws.auto_cycle_frequency as string) ?? "weekly"] ?? 7,
      });
      if (!result.error) autoCycled++;
      else console.error(`[cron/chore-reminders] auto-cycle failed for house ${rot.house_id}:`, result.error);
    }

    const { data: signoffs } = await admin
      .from("chore_signoffs")
      .select(
        `id,
         sign_off_date,
         rotation_assignment:chore_rotation_assignments!inner(
           resident:residents!inner(user_id, full_name),
           chore:chores!inner(name, house_id)
         )`
      )
      .eq("sign_off_date", today)
      .in("status", ["pending", "redo"]);

    // --- hygiene: archive reviewed signoffs (30d) + old notifications ---
    // Reviewed/closed chore signoffs older than 30 days are removed so
    // the Needs Review backlog stays meaningful. Read notifications
    // older than 30 days are purged so badges/bell counts don't grow
    // unbounded.
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString();
    await admin
      .from("chore_signoffs")
      .delete()
      .in("status", ["approved", "rejected", "missed"])
      .lt("updated_at", cutoff);
    await admin
      .from("notifications")
      .delete()
      .eq("is_read", true)
      .lt("created_at", cutoff);

    // Note: no early return when there are no pending signoffs — the
    // missed-meeting auto-demerit check below still has to run on
    // Sunday evenings even when every chore is done.
    const signoffRows = signoffs ?? [];

    // Workspace reminder toggles: chores the resident sees only when
    // the workspace keeps the "chore" reminder enabled.
    const houseIdsForWs = [
      ...new Set(
        signoffRows
          .map((r) => {
            const a = r.rotation_assignment as unknown as {
              chore: { house_id: string } | null;
            } | null;
            return a?.chore?.house_id ?? null;
          })
          .filter((x): x is string => Boolean(x))
      ),
    ];
    const { data: wsHouses } = await admin
      .from("houses")
      .select("id, workspace_id")
      .in("id", houseIdsForWs);
    const houseToWs = new Map<string, string | null>();
    for (const h of wsHouses ?? []) {
      houseToWs.set(
        h.id as string,
        (h.workspace_id as string | null) ?? null
      );
    }
    const { data: reminderRows } = await admin
      .from("workspace_settings")
      .select("workspace_id, reminder_settings");
    const reminderByWs = new Map<
      string,
      Record<string, { enabled?: boolean }>
    >();
    for (const w of reminderRows ?? []) {
      reminderByWs.set(
        w.workspace_id as string,
        (w.reminder_settings as Record<string, { enabled?: boolean }>) ?? {}
      );
    }
    const choreRemindersOn = (houseId: string | null | undefined) => {
      if (!houseId) return true;
      const ws = houseToWs.get(houseId);
      if (!ws) return true;
      return reminderByWs.get(ws)?.chore?.enabled !== false;
    };

    let sent = 0;
    const missedItems: { label: string; houseId: string }[] = [];

    for (const row of signoffRows) {
      const assignment = row.rotation_assignment as unknown as {
        resident: { user_id: string | null; full_name: string };
        chore: { name: string; house_id: string };
      } | null;

      if (!assignment?.resident?.user_id) continue;
      if (!choreRemindersOn(assignment.chore.house_id)) continue;

      const title = isEvening ? "Chore Must Be Completed" : "Chore Reminder";
      const body = isEvening
        ? `Your chore "${assignment.chore.name}" has not been completed. You must complete it before the end of the day.`
        : `Your chore "${assignment.chore.name}" is due today and has not been completed yet.`;

      await sendWebPush(assignment.resident.user_id, "chore_reminder", {
        title,
        body,
        url: "/chores",
      });
      sent++;

      if (isEvening) {
        missedItems.push({
          label: `${assignment.resident.full_name} — ${assignment.chore.name}`,
          houseId: assignment.chore.house_id ?? "",
        });
      }
    }

    // Notify staff about incomplete chores at 10 PM so they have
    // visibility — grouped by workspace so each workspace's staff only
    // sees their own residents' missed chores.
    if (isEvening && missedItems.length > 0) {
      const houseIds = [
        ...new Set(missedItems.map((m) => m.houseId).filter(Boolean)),
      ];
      const { data: houseRows } =
        houseIds.length > 0
          ? await admin
              .from("houses")
              .select("id, workspace_id")
              .in("id", houseIds)
          : { data: [] as { id: string; workspace_id: string | null }[] };
      const houseToWs = new Map<string, string | null>();
      for (const h of houseRows ?? []) {
        houseToWs.set(h.id as string, (h.workspace_id as string | null) ?? null);
      }

      // Partition missed items by workspace ("__none__" = legacy houses
      // with no workspace).
      const byWorkspace = new Map<
        string,
        { names: string[]; houses: Set<string> }
      >();
      for (const item of missedItems) {
        const ws = item.houseId ? houseToWs.get(item.houseId) ?? null : null;
        const key = ws ?? "__none__";
        let group = byWorkspace.get(key);
        if (!group) {
          group = { names: [], houses: new Set<string>() };
          byWorkspace.set(key, group);
        }
        group.names.push(item.label);
        if (item.houseId) group.houses.add(item.houseId);
      }

      for (const [key, group] of byWorkspace) {
        const workspaceId = key === "__none__" ? null : key;
        const staffIds = await getStaffForWorkspace(admin, workspaceId, [
          ...group.houses,
        ]);
        if (staffIds.length === 0) continue;
        const summary =
          group.names.length <= 5
            ? group.names.join(", ")
            : `${group.names.slice(0, 5).join(", ")} +${group.names.length - 5} more`;
        await sendWebPushToMany(staffIds, "chore_missed_staff", {
          title: "Incomplete Chores Tonight",
          body: summary,
          url: "/chores",
        });
      }
    }

    // Missed-meeting auto-demerit: on Sunday evening, residents with
    // no meeting logged since Monday get a 1-point demerit when their
    // workspace enables it.
    let meetingDemerits = 0;
    if (isEvening && nowInTz.getDay() === 0) {
      const { data: meetingOn } = await admin
        .from("workspace_settings")
        .select("workspace_id")
        .eq("auto_demerit_missed_meetings", true);

      const wsIds = new Set(
        (meetingOn ?? []).map((w) => w.workspace_id as string)
      );
      if (wsIds.size > 0) {
        const { data: res } = await admin
          .from("residents")
          .select("id, full_name, house_id, houses!inner(workspace_id)")
          .eq("status", "active");
        for (const r of res ?? []) {
          const wsId =
            (r.houses as unknown as { workspace_id: string | null })
              ?.workspace_id ?? null;
          if (!wsId || !wsIds.has(wsId)) continue;

          const { data: mtg } = await admin
            .from("meetings")
            .select("id")
            .eq("resident_id", r.id)
            .gte("meeting_at", mondayIso)
            .limit(1);
          if (mtg && mtg.length > 0) continue;

          const reason = `Missed meeting week of ${mondayIso}`;
          const { data: dup } = await admin
            .from("demerits")
            .select("id")
            .eq("resident_id", r.id)
            .eq("reason", reason)
            .limit(1);
          if (dup && dup.length > 0) continue;

          await admin.from("demerits").insert({
            resident_id: r.id,
            house_id: r.house_id,
            points: 1,
            reason,
            category: "Missed Meeting",
            issued_by: null,
          });
          meetingDemerits++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      autoCycled,
      meetingDemerits,
      variant: isEvening ? "evening" : "noon",
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/chore-reminders] failed", msg);
    return NextResponse.json(
      { ok: false, error: msg, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}
