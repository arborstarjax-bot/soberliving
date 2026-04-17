// Charge scheduling helpers. Rent is monthly, on the same calendar
// day each month as the commitment_start_date. No proration, no late
// fees — a missed month is just an open charge in the past until it
// gets paid.
//
// `addMonthsClamped(start, n)` handles the edge case where the start
// day is 29 / 30 / 31 and the target month is shorter (Feb 31 → Feb
// 28/29). The day is clamped down so we never skip a month or roll
// over into the next one.

import { createAdminClient } from "@/lib/supabase/server";

export function addMonthsClamped(start: Date, months: number): Date {
  const y = start.getFullYear();
  const m = start.getMonth();
  const d = start.getDate();
  const target = new Date(y, m + months, 1);
  const lastDayOfTargetMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();
  target.setDate(Math.min(d, lastDayOfTargetMonth));
  return target;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(s: string): Date {
  // Construct as local date so we don't drift a day on the PDT/UTC
  // boundary. `new Date("2025-11-15")` is midnight UTC which can
  // render as Nov 14 in negative timezones; the split-and-construct
  // form keeps it anchored to local midnight.
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

// Given a commitment start date and a list of existing rent charges,
// compute the next due_date to open. Returns null if the resident is
// already current (there's an open charge covering today or later).
export function nextDueDate(
  commitmentStart: Date,
  existingDueDates: Date[]
): Date {
  if (existingDueDates.length === 0) return commitmentStart;
  const max = existingDueDates.reduce(
    (a, b) => (a.getTime() > b.getTime() ? a : b),
    existingDueDates[0]
  );
  // Next cycle = one month after the most recent due.
  const diffMonths =
    (max.getFullYear() - commitmentStart.getFullYear()) * 12 +
    (max.getMonth() - commitmentStart.getMonth());
  return addMonthsClamped(commitmentStart, diffMonths + 1);
}

interface CommitmentRow {
  id: string;
  resident_id: string | null;
  house_id: string;
  rent_amount: number;
  admin_fee: number | null;
  commitment_start_date: string;
  status: string;
}

// Opens rent charges for a resident up through the current calendar
// month — i.e. on commitment-activation we open the first month, and
// subsequent loads will open each new month as it arrives.
//
// Idempotent: the (resident_id, due_date, charge_type) unique index
// guarantees duplicate rows are rejected, so calling this twice in
// the same second is safe.
//
// Returns the count of charges opened for logging / debugging.
export async function openRentChargesForCommitment(
  commitmentId: string
): Promise<number> {
  const supabase = createAdminClient();

  const { data: commitment } = await supabase
    .from("house_commitments")
    .select(
      "id, resident_id, house_id, rent_amount, admin_fee, commitment_start_date, status"
    )
    .eq("id", commitmentId)
    .single<CommitmentRow>();

  if (!commitment || commitment.status !== "active") return 0;
  if (!commitment.resident_id) return 0;

  const start = parseIsoDate(commitment.commitment_start_date);

  const { data: existing } = await supabase
    .from("payment_charges")
    .select("due_date")
    .eq("resident_id", commitment.resident_id)
    .eq("charge_type", "rent");
  const existingDates: Date[] = (existing ?? []).map((r) =>
    parseIsoDate(r.due_date as unknown as string)
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows: Array<{
    resident_id: string;
    house_id: string;
    commitment_id: string;
    charge_type: "rent";
    amount: number;
    due_date: string;
    period_start: string;
    period_end: string;
  }> = [];

  let openedCount = 0;
  let safety = 0;
  while (safety++ < 60) {
    const due = nextDueDate(start, [...existingDates, ...rows.map((r) => parseIsoDate(r.due_date))]);
    if (due.getTime() > today.getTime()) {
      // We still open the *upcoming* charge (next due_date > today)
      // once, so residents can see "Next due" on their dashboard and
      // staff can record payments ahead of time. Then stop.
      if (openedCount > 0 || existingDates.length > 0) break;
    }
    const periodStart = toIsoDate(due);
    const periodEnd = toIsoDate(addMonthsClamped(due, 1));
    rows.push({
      resident_id: commitment.resident_id,
      house_id: commitment.house_id,
      commitment_id: commitment.id,
      charge_type: "rent",
      amount: commitment.rent_amount,
      due_date: toIsoDate(due),
      period_start: periodStart,
      period_end: periodEnd,
    });
    openedCount += 1;
    if (due.getTime() > today.getTime()) break;
  }

  if (rows.length > 0) {
    // On-conflict do-nothing via unique index — duplicate opens are
    // idempotent even if two requests race.
    await supabase.from("payment_charges").upsert(rows, {
      onConflict: "resident_id,due_date,charge_type",
      ignoreDuplicates: true,
    });
  }

  return openedCount;
}

// Opens a one-time admin fee / deposit charge at commitment start.
// Safe to call multiple times — unique index prevents duplicates.
export async function openStartupChargesForCommitment(
  commitmentId: string
): Promise<void> {
  const supabase = createAdminClient();

  const { data: commitment } = await supabase
    .from("house_commitments")
    .select(
      "id, resident_id, house_id, rent_amount, admin_fee, commitment_start_date, status"
    )
    .eq("id", commitmentId)
    .single<CommitmentRow>();

  if (!commitment || commitment.status !== "active") return;
  if (!commitment.resident_id) return;

  const startIso = commitment.commitment_start_date;

  const startupRows: Array<{
    resident_id: string;
    house_id: string;
    commitment_id: string;
    charge_type: "admin_fee";
    amount: number;
    due_date: string;
  }> = [];

  if (commitment.admin_fee && commitment.admin_fee > 0) {
    startupRows.push({
      resident_id: commitment.resident_id,
      house_id: commitment.house_id,
      commitment_id: commitment.id,
      charge_type: "admin_fee",
      amount: commitment.admin_fee,
      due_date: startIso,
    });
  }

  if (startupRows.length > 0) {
    await supabase.from("payment_charges").upsert(startupRows, {
      onConflict: "resident_id,due_date,charge_type",
      ignoreDuplicates: true,
    });
  }
}

// Calls both startup and recurring openers in one go.
export async function openAllChargesForCommitment(
  commitmentId: string
): Promise<void> {
  await openStartupChargesForCommitment(commitmentId);
  await openRentChargesForCommitment(commitmentId);
}

// Bulk opener — sweeps every active commitment and opens any missing
// monthly charges up through today + the upcoming due. Used by the
// payments page on load as a lazy cron replacement so residents /
// staff don't have to manually advance the schedule.
export async function sweepOpenChargesForActiveCommitments(
  houseIds?: string[] | null
): Promise<void> {
  const supabase = createAdminClient();
  let q = supabase
    .from("house_commitments")
    .select("id")
    .eq("status", "active");
  if (houseIds && houseIds.length > 0) q = q.in("house_id", houseIds);
  const { data } = await q;
  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  // Run sequentially — these writes all upsert into the same table
  // and a parallel fan-out on 100+ residents would hammer the DB for
  // no real throughput win.
  for (const id of ids) {
    await openRentChargesForCommitment(id);
  }
}
