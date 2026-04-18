import { NextRequest, NextResponse } from "next/server";
import { sweepOpenChargesForActiveCommitments } from "@/lib/payments/charges";

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
    return NextResponse.json({
      ok: true,
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
