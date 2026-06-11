import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendWebPush } from "@/lib/push";
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
           chore:chores!inner(name)
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
    for (const row of signoffs) {
      const assignment = row.rotation_assignment as unknown as {
        resident: { user_id: string | null; full_name: string };
        chore: { name: string };
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
