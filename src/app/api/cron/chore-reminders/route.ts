import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendWebPush } from "@/lib/push";
import { getHouseToday, DEFAULT_TIMEZONE } from "@/lib/timezone";

// Vercel Cron — scheduled to run daily at noon Eastern (17:00 UTC).
// Finds all pending chore signoffs due today and sends a push
// notification to the assigned resident.
//
// Auth: same CRON_SECRET bearer token pattern as sweep-charges.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const today = getHouseToday(DEFAULT_TIMEZONE);

    // All pending signoffs due today, joined to get the resident's
    // user_id and chore name.
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

      await sendWebPush(assignment.resident.user_id, "chore_reminder", {
        title: "Chore Reminder",
        body: `Your chore "${assignment.chore.name}" is due today.`,
        url: "/chores",
      });
      sent++;
    }

    return NextResponse.json({
      ok: true,
      sent,
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
