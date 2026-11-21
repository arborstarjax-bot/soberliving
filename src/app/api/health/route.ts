import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Public health + latency probe. Used for monitoring and for an external
// keep-alive pinger (e.g. UptimeRobot every 5 min) so the Supabase project
// and this serverless function stay warm — the main lever on free-tier
// first-hit latency. No secrets: returns timing + row-existence only.
export async function GET() {
  const started = Date.now();
  const admin = createAdminClient();
  const { error } = await admin.from("houses").select("id").limit(1);
  const dbMs = Date.now() - started;
  return NextResponse.json({
    ok: !error,
    db_ms: dbMs,
    error: error?.message ?? null,
    ts: new Date().toISOString(),
  });
}
