import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendWebPush, sendWebPushToMany } from "@/lib/push";
import { getHouseToday, DEFAULT_TIMEZONE } from "@/lib/timezone";

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
  const adminsQuery = workspaceId
    ? admin
        .from("user_roles")
        .select("user_id, users!inner(workspace_id)")
        .eq("role", "admin")
        .eq("users.workspace_id", workspaceId)
    : admin.from("user_roles").select("user_id").eq("role", "admin");

  const [adminsRes, managersRes] = await Promise.all([
    adminsQuery,
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

    if (!signoffs || signoffs.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        variant: isEvening ? "evening" : "noon",
        durationMs: Date.now() - startedAt,
      });
    }

    let sent = 0;
    const missedItems: { label: string; houseId: string }[] = [];

    for (const row of signoffs) {
      const assignment = row.rotation_assignment as unknown as {
        resident: { user_id: string | null; full_name: string };
        chore: { name: string; house_id: string };
      } | null;

      if (!assignment?.resident?.user_id) continue;

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

    return NextResponse.json({
      ok: true,
      sent,
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
