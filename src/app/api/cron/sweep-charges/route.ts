import { NextRequest, NextResponse } from "next/server";
import {
  sweepOpenChargesForActiveCommitments,
  computeRentDueDate,
  nextDueDate,
  normalizePaymentFrequency,
  parseIsoDate,
  toIsoDate,
} from "@/lib/payments/charges";
import { createAdminClient } from "@/lib/supabase/server";
import { sendWebPush } from "@/lib/push";

// Daily cron that opens any missing rent charges for every active
// commitment. Replaces the former "lazy cron" that ran on every
// staff /payments page load — see vercel.json for the schedule.
//
// Scope: rent only. Admin-fee / deposit charges are opened once at
// commitment activation (intake-review/actions.ts +
// sign-commitment/actions.ts), not by this sweep — removing those
// opener calls from the activation paths would mean admin fees stop
// being created for new residents.
//
// `sweepOpenChargesForActiveCommitments` is idempotent via the
// (resident, due_date, charge_type) unique index, so re-running the
// cron (or running it alongside a page-load backfill during a
// transition) cannot duplicate charges.
//
// Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
// Anything else is rejected with 401. If CRON_SECRET is unset, the
// route refuses to run — better to fail closed and notice in logs
// than to expose an unauthenticated write endpoint.

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
    // No house filter — cron operates across every active commitment.
    await sweepOpenChargesForActiveCommitments(null);

    // Rent reminders: push residents with rent due today or tomorrow,
    // per each workspace's "rent" reminder toggle + timing.
    let remindersSent = 0;
    const admin = createAdminClient();
    const todayIso = new Date().toISOString().slice(0, 10);
    const tomorrowIso = new Date(Date.now() + 86400000)
      .toISOString()
      .slice(0, 10);

    const { data: dues } = await admin
      .from("payment_charges")
      .select(
        "id, resident_id, due_date, amount, residents!inner(user_id, house_id, houses!inner(workspace_id))"
      )
      .eq("charge_type", "rent")
      .eq("status", "open")
      .in("due_date", [todayIso, tomorrowIso]);

    const { data: wsRows } = await admin
      .from("workspace_settings")
      .select("workspace_id, reminder_settings");
    const reminderByWs = new Map<
      string,
      Record<string, { enabled?: boolean; timing?: string }>
    >();
    for (const w of wsRows ?? []) {
      reminderByWs.set(
        w.workspace_id as string,
        (w.reminder_settings as Record<
          string,
          { enabled?: boolean; timing?: string }
        >) ?? {}
      );
    }

    for (const charge of dues ?? []) {
      const resident = charge.residents as unknown as {
        user_id: string | null;
        house_id: string;
        houses: { workspace_id: string | null };
      };
      const wsId = resident.houses?.workspace_id ?? null;
      const cfg = wsId ? reminderByWs.get(wsId) : undefined;
      if (cfg?.rent?.enabled === false) continue;
      const timing = cfg?.rent?.timing === "day_before"
        ? "day_before"
        : "day_of";
      const wantDate = timing === "day_before" ? tomorrowIso : todayIso;
      if (charge.due_date !== wantDate) continue;
      if (!resident.user_id) continue;

      await sendWebPush(resident.user_id, "rent_reminder", {
        title: "Rent Due",
        body: `Rent of $${Number(charge.amount).toFixed(2)} is due ${
          charge.due_date === todayIso ? "today" : "tomorrow"
        } (${charge.due_date}).`,
        url: "/payments",
      });
      remindersSent++;
    }

    // Day-before reminders: open charges for tomorrow can never exist
    // (the sweep only opens due ≤ today), so compute each active
    // commitment's next due date from its terms and remind when it
    // lands tomorrow — only for workspaces set to `day_before`.
    const { data: commitments } = await admin
      .from("house_commitments")
      .select(
        "id, resident_id, commitment_start_date, billing_anchor_date, payment_frequency, rent_amount, residents!inner(user_id, house_id, houses!inner(workspace_id))"
      )
      .eq("status", "active")
      .not("resident_id", "is", null)
      .gt("rent_amount", 0);

    const dayBeforeCommitments = (commitments ?? []).filter((c) => {
      const res = c.residents as unknown as {
        user_id: string | null;
        houses: { workspace_id: string | null };
      };
      const wsId = res.houses?.workspace_id ?? null;
      if (!res.user_id) return false;
      const cfg = wsId ? reminderByWs.get(wsId) : undefined;
      return cfg?.rent?.enabled !== false && cfg?.rent?.timing === "day_before";
    });

    if (dayBeforeCommitments.length > 0) {
      const { data: periodRows } = await admin
        .from("payment_charges")
        .select("commitment_id, period_start")
        .in(
          "commitment_id",
          dayBeforeCommitments.map((c) => c.id)
        )
        .eq("charge_type", "rent");
      const periodsByCommitment = new Map<string, string[]>();
      for (const p of periodRows ?? []) {
        const list = periodsByCommitment.get(p.commitment_id as string) ?? [];
        list.push(p.period_start as string);
        periodsByCommitment.set(p.commitment_id as string, list);
      }

      for (const c of dayBeforeCommitments) {
        const start = parseIsoDate(
          (c.billing_anchor_date as string | null) ??
            (c.commitment_start_date as string)
        );
        const periods = (periodsByCommitment.get(c.id) ?? []).map(parseIsoDate);
        const nextDue = computeRentDueDate(
          nextDueDate(
            start,
            periods,
            normalizePaymentFrequency(c.payment_frequency as string)
          )
        );
        if (toIsoDate(nextDue) !== tomorrowIso) continue;
        const res = c.residents as unknown as { user_id: string };
        await sendWebPush(res.user_id, "rent_reminder", {
          title: "Rent Due",
          body: `Rent of $${Number(c.rent_amount).toFixed(2)} is due tomorrow (${tomorrowIso}).`,
          url: "/payments",
        });
        remindersSent++;
      }
    }

    return NextResponse.json({
      ok: true,
      remindersSent,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/sweep-charges] failed", msg);
    return NextResponse.json(
      { ok: false, error: msg, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}
