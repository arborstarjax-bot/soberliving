// Charge scheduling helpers. Rent is either monthly or weekly,
// driven by the commitment's `payment_frequency`:
//   - monthly → same calendar day each month as commitment_start_date.
//                `addMonthsClamped` handles 29/30/31 → shorter month
//                by clamping down (Feb 31 → Feb 28/29) so we never
//                skip a month or roll over.
//   - weekly  → same weekday every 7 days starting at
//                commitment_start_date. Simple +7 day step.
// No proration, no late fees — a missed cycle is just an open charge
// in the past until it gets paid.

import { createAdminClient } from "@/lib/supabase/server";

export type PaymentFrequency = "weekly" | "monthly";

export function normalizePaymentFrequency(
  v: string | null | undefined
): PaymentFrequency {
  return v === "weekly" ? "weekly" : "monthly";
}

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

// Step forward `cycles` rent cycles from `start`. For monthly
// commitments that's the same clamp-day logic as addMonthsClamped.
// For weekly, it's just start + 7*cycles days.
export function addCycles(
  start: Date,
  cycles: number,
  frequency: PaymentFrequency
): Date {
  if (frequency === "weekly") {
    const d = new Date(start);
    d.setDate(d.getDate() + 7 * cycles);
    return d;
  }
  return addMonthsClamped(start, cycles);
}

// Period end of a rent charge — i.e. the start of the NEXT cycle.
// `period_start = due_date` by convention, so period_end is just one
// cycle after due_date.
export function periodEndFor(
  due: Date,
  frequency: PaymentFrequency
): Date {
  return addCycles(due, 1, frequency);
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

// Given a commitment start date + the list of due_dates that already
// exist for this commitment's rent charges, compute the next due_date
// to open. Cadence is driven by `frequency` so weekly commitments
// step by 7 days and monthly commitments step by one month (clamped).
export function nextDueDate(
  commitmentStart: Date,
  existingDueDates: Date[],
  frequency: PaymentFrequency = "monthly"
): Date {
  if (existingDueDates.length === 0) return commitmentStart;
  const max = existingDueDates.reduce(
    (a, b) => (a.getTime() > b.getTime() ? a : b),
    existingDueDates[0]
  );
  // For weekly cadence the cycle count is derived from day-diff /7.
  // For monthly it's (yearDiff*12 + monthDiff) which ignores the day
  // component — anchor clamping is then re-applied by addMonthsClamped.
  if (frequency === "weekly") {
    const MS = 24 * 60 * 60 * 1000;
    const dayDiff = Math.round(
      (max.getTime() - commitmentStart.getTime()) / MS
    );
    const cycles = Math.floor(dayDiff / 7);
    return addCycles(commitmentStart, cycles + 1, "weekly");
  }
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
  created_at: string;
  payment_frequency?: string | null;
  // Existing-tenant activation support. When set, rent cycles anchor
  // to this date instead of commitment_start_date, and the startup
  // admin-fee charge is suppressed. Both are optional — legacy
  // commitments keep the original behaviour.
  billing_anchor_date?: string | null;
  skip_initial_admin_fee?: boolean | null;
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
      "id, resident_id, house_id, rent_amount, admin_fee, commitment_start_date, status, created_at, payment_frequency, billing_anchor_date, skip_initial_admin_fee"
    )
    .eq("id", commitmentId)
    .single<CommitmentRow>();

  if (!commitment || commitment.status !== "active") return 0;
  if (!commitment.resident_id) return 0;

  const frequency = normalizePaymentFrequency(commitment.payment_frequency);

  // When a commitment has an explicit billing_anchor_date (existing-
  // tenant activation), use it as both the rent-cycle anchor AND the
  // backfill cutoff. That way the first opened charge is the future
  // rent payment the admin scheduled, nothing is retroactively
  // created back to commitment_start_date.
  const start = parseIsoDate(
    commitment.billing_anchor_date ?? commitment.commitment_start_date
  );

  // System-recorded cutoff. For migration-in residents whose real
  // move-in date predates this app by months (or years), we don't
  // want to flood them with back-charges — billing only exists from
  // the point their commitment was recorded here. `createdAt` is
  // derived from the commitment row itself, so residents onboarded
  // inside the app aren't affected (their created_at ≈ start).
  const createdAtDate = new Date(commitment.created_at);
  createdAtDate.setHours(0, 0, 0, 0);
  const cutoff =
    createdAtDate.getTime() > start.getTime() ? createdAtDate : start;

  // Scope to THIS commitment's rent charges only. After an amendment
  // that changes the monthly due day (e.g. day-15 → day-28), paid
  // charges from the superseded commitment would otherwise poison
  // `nextDueDate`: it takes the max existing due and adds a month, so
  // a Feb-15 (old) paid charge combined with a Jan-28 (new) start would
  // compute Mar-28 and skip Jan-28 / Feb-28 at the new rate entirely.
  // The unique index (resident_id, due_date, charge_type) + upsert
  // ignoreDuplicates below handles any same-day collisions with old
  // commitment charges.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = toIsoDate(today);

  // Clean up any unpaid rent charges with a due_date strictly in the
  // future. Previous versions of this opener pre-opened upcoming
  // charges which accumulated on every page load and produced the
  // huge ledger David flagged. The rule now is: the only rent rows
  // on the books should be past-due or current-cycle (due ≤ today).
  // Paid / partial future rows are never touched.
  await supabase
    .from("payment_charges")
    .delete()
    .eq("resident_id", commitment.resident_id)
    .eq("commitment_id", commitment.id)
    .eq("charge_type", "rent")
    .eq("status", "open")
    .gt("due_date", todayIso);

  // Scope to THIS commitment's remaining rent charges. After an
  // amendment that changes the monthly due day (e.g. day-15 →
  // day-28), paid charges from the superseded commitment would
  // otherwise poison `nextDueDate`: it takes the max existing due
  // and adds a month, so a Feb-15 (old) paid charge combined with a
  // Jan-28 (new) start would compute Mar-28 and skip Jan-28 / Feb-28
  // at the new rate entirely. The unique index (resident_id,
  // due_date, charge_type) + upsert ignoreDuplicates below handles
  // any same-day collisions with old commitment charges.
  const { data: existing } = await supabase
    .from("payment_charges")
    .select("due_date")
    .eq("resident_id", commitment.resident_id)
    .eq("commitment_id", commitment.id)
    .eq("charge_type", "rent");
  const existingDates: Date[] = (existing ?? []).map((r) =>
    parseIsoDate(r.due_date as unknown as string)
  );

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

  // Strategy: open every rent cycle whose due_date is on or before
  // today AND on or after the system cutoff (commitment.created_at).
  // We never pre-open future cycles — the next cycle's row will be
  // opened when the calendar actually reaches its due day. The Next
  // Rent card computes the upcoming due virtually from the commitment
  // terms, so residents still see when their next payment lands.
  //
  // Safety cap is 1040 which covers ~20 years of weekly cycles or 87
  // years of monthly — we'll break via the today-cutoff long before
  // that in practice.
  let openedCount = 0;
  let safety = 0;
  while (safety++ < 1040) {
    const due = nextDueDate(
      start,
      [
        ...existingDates,
        ...rows.map((r) => parseIsoDate(r.due_date)),
      ],
      frequency
    );
    // Stop opening once we've caught up to today. No future rows.
    if (due.getTime() > today.getTime()) break;
    // Skip anything before the system cutoff — don't backfill charges
    // from before the resident was on the system. We still push to
    // the virtual cursor list (via existingDates) so nextDueDate
    // keeps advancing each iteration.
    if (due.getTime() < cutoff.getTime()) {
      existingDates.push(due);
      continue;
    }
    const periodStart = toIsoDate(due);
    const periodEnd = toIsoDate(periodEndFor(due, frequency));
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
      "id, resident_id, house_id, rent_amount, admin_fee, commitment_start_date, status, created_at, payment_frequency, billing_anchor_date, skip_initial_admin_fee"
    )
    .eq("id", commitmentId)
    .single<CommitmentRow>();

  if (!commitment || commitment.status !== "active") return;
  if (!commitment.resident_id) return;

  // Existing-tenant activations may have the admin fee marked as
  // already collected/waived. In that case we skip opening it so it
  // doesn't show up as outstanding against the resident.
  if (commitment.skip_initial_admin_fee) return;

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

// Materializes the next unpaid rent cycle on demand. Used by the
// "Pay Upcoming Rent" flow so staff can collect rent before the
// scheduled due day without having the opener pre-open months ahead.
//
// Returns the charge row (created or pre-existing) or null if the
// commitment isn't in a state to open charges.
export async function materializeNextRentCharge(commitmentId: string): Promise<{
  id: string;
  amount: number;
  due_date: string;
  period_start: string;
  period_end: string;
} | null> {
  const supabase = createAdminClient();

  const { data: commitment } = await supabase
    .from("house_commitments")
    .select(
      "id, resident_id, house_id, rent_amount, admin_fee, commitment_start_date, status, created_at, payment_frequency, billing_anchor_date, skip_initial_admin_fee"
    )
    .eq("id", commitmentId)
    .single<CommitmentRow>();

  if (!commitment || commitment.status !== "active") return null;
  if (!commitment.resident_id) return null;

  const frequency = normalizePaymentFrequency(commitment.payment_frequency);

  // Existing-tenant activations carry a `billing_anchor_date` that
  // overrides `commitment_start_date` as the rent-cycle anchor. Honor
  // it here so "Pay Upcoming Rent" materializes charges on the same
  // schedule that openRentChargesForCommitment uses.
  const start = parseIsoDate(
    commitment.billing_anchor_date ?? commitment.commitment_start_date
  );

  // If there's already an open/partial rent charge, surface it instead
  // of opening another one. That row is the "next rent" from the
  // resident's perspective even if it's in the past.
  const { data: existingOpen } = await supabase
    .from("payment_charges")
    .select("id, amount, due_date, period_start, period_end, status")
    .eq("resident_id", commitment.resident_id)
    .eq("commitment_id", commitment.id)
    .eq("charge_type", "rent")
    .in("status", ["open", "partial"])
    .order("due_date", { ascending: true })
    .limit(1);
  const openRow = existingOpen?.[0];
  if (openRow) {
    return {
      id: openRow.id as string,
      amount: Number(openRow.amount),
      due_date: openRow.due_date as string,
      period_start: (openRow.period_start as string) ?? (openRow.due_date as string),
      period_end: (openRow.period_end as string) ?? (openRow.due_date as string),
    };
  }

  // No open charge — compute the next cycle past all existing rent
  // rows (paid included), clamp to the commitment day-of-month.
  const { data: existing } = await supabase
    .from("payment_charges")
    .select("due_date")
    .eq("resident_id", commitment.resident_id)
    .eq("commitment_id", commitment.id)
    .eq("charge_type", "rent");
  const existingDates: Date[] = (existing ?? []).map((r) =>
    parseIsoDate(r.due_date as unknown as string)
  );

  const due = nextDueDate(start, existingDates, frequency);
  const periodStart = toIsoDate(due);
  const periodEnd = toIsoDate(periodEndFor(due, frequency));
  const dueIso = toIsoDate(due);

  // Insert with onConflict do-nothing in case two admins click Pay
  // Upcoming in the same moment — we then re-select the winning row.
  const { data: inserted } = await supabase
    .from("payment_charges")
    .upsert(
      {
        resident_id: commitment.resident_id,
        house_id: commitment.house_id,
        commitment_id: commitment.id,
        charge_type: "rent" as const,
        amount: commitment.rent_amount,
        due_date: dueIso,
        period_start: periodStart,
        period_end: periodEnd,
      },
      { onConflict: "resident_id,due_date,charge_type", ignoreDuplicates: true }
    )
    .select("id, amount, due_date, period_start, period_end")
    .single();

  if (inserted) {
    return {
      id: inserted.id as string,
      amount: Number(inserted.amount),
      due_date: inserted.due_date as string,
      period_start: (inserted.period_start as string) ?? dueIso,
      period_end: (inserted.period_end as string) ?? dueIso,
    };
  }

  // Lost the race — re-read the winning row.
  const { data: raced } = await supabase
    .from("payment_charges")
    .select("id, amount, due_date, period_start, period_end")
    .eq("resident_id", commitment.resident_id)
    .eq("commitment_id", commitment.id)
    .eq("charge_type", "rent")
    .eq("due_date", dueIso)
    .single();
  if (!raced) return null;
  return {
    id: raced.id as string,
    amount: Number(raced.amount),
    due_date: raced.due_date as string,
    period_start: (raced.period_start as string) ?? dueIso,
    period_end: (raced.period_end as string) ?? dueIso,
  };
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
