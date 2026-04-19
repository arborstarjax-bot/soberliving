// Intake-activation helpers.
//
// Pure functions extracted from `intake-review/actions.ts` so the
// payment-specific pieces of `completeIntakeReview` can be reasoned
// about — and tested — in isolation from the orchestration code
// (auth, DB access, revalidation, notifications).
//
// Everything in here is deterministic: given the same inputs, returns
// the same outputs. No DB calls, no clock reads (the caller passes
// `now` when one is needed), no network I/O.

import { periodEndFor, parseIsoDate, toIsoDate } from "./charges";
import type { PaymentFrequency } from "./charges";

// ── Sobriety-date validation ────────────────────────────────────────
//
// Drops future-dated or unparseable values silently so a legacy intake
// form can't block activation. Returns the valid ISO date or `null`.
//
// We take `now` as an argument so the caller controls the clock (and
// timezone) — tests pass a fixed Date; prod passes `new Date()`.
export function normalizeSobrietyDate(
  raw: string | null | undefined,
  now: Date
): string | null {
  if (!raw) return null;
  const entered = new Date(raw);
  if (isNaN(entered.getTime())) return null;

  // End-of-day in the caller's local TZ so "today" doesn't get
  // rejected for being a few hours in the future.
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  if (entered.getTime() > endOfToday.getTime()) return null;

  return raw;
}

// ── Initial charge rows opened at intake ────────────────────────────
//
// Returns the array of `payment_charges` rows the caller should
// upsert. Existing-tenant activations return an empty array — the
// anchor date is always in the future so there's no first-cycle rent
// to pre-open, and the admin fee is suppressed via
// `skip_initial_admin_fee`.
export interface InitialChargesInput {
  residentId: string;
  houseId: string;
  commitmentId: string;
  commitmentStartDate: string;
  rentAmount: number;
  adminFee: number;
  frequency: PaymentFrequency;
  existingTenant: boolean;
  // When true, the admin-fee charge is not opened. Used for both
  // new intakes where the fee was paid prior to move-in or waived,
  // and existing-tenant activations (caught up on everything).
  skipAdminFee?: boolean;
}

export interface InitialChargeRow {
  resident_id: string;
  house_id: string;
  commitment_id: string;
  charge_type: "admin_fee" | "rent";
  amount: number;
  due_date: string;
  period_start?: string;
  period_end?: string;
}

export function buildInitialCharges(
  input: InitialChargesInput
): InitialChargeRow[] {
  if (input.existingTenant) return [];

  const rows: InitialChargeRow[] = [];

  if (input.adminFee > 0 && !input.skipAdminFee) {
    rows.push({
      resident_id: input.residentId,
      house_id: input.houseId,
      commitment_id: input.commitmentId,
      charge_type: "admin_fee",
      amount: input.adminFee,
      due_date: input.commitmentStartDate,
    });
  }

  const rentPeriodEnd = toIsoDate(
    periodEndFor(parseIsoDate(input.commitmentStartDate), input.frequency)
  );

  rows.push({
    resident_id: input.residentId,
    house_id: input.houseId,
    commitment_id: input.commitmentId,
    charge_type: "rent",
    amount: input.rentAmount,
    due_date: input.commitmentStartDate,
    period_start: input.commitmentStartDate,
    period_end: rentPeriodEnd,
  });

  return rows;
}

// ── Move-in payment allocation ──────────────────────────────────────
//
// Given the collected amount and the freshly opened admin-fee / rent
// charges, compute how much of the payment to apply to each — admin
// fee first, rent second. The "first" ordering is what dictates which
// charge ID gets stamped on the `payments` row as the primary charge.
export interface OpenChargeRef {
  id: string;
  amount: number;
}

export interface Allocation {
  chargeId: string;
  chargeType: "admin_fee" | "rent";
  applied: number;
}

export interface MoveInAllocationInput {
  amount: number;
  adminFeeCharge?: OpenChargeRef | null;
  rentCharge?: OpenChargeRef | null;
}

export function allocateMoveInPayment(
  input: MoveInAllocationInput
): Allocation[] {
  const allocations: Allocation[] = [];
  let remaining = input.amount;

  if (input.adminFeeCharge && remaining > 0) {
    const apply = Math.min(remaining, Number(input.adminFeeCharge.amount));
    if (apply > 0) {
      allocations.push({
        chargeId: input.adminFeeCharge.id,
        chargeType: "admin_fee",
        applied: apply,
      });
      remaining -= apply;
    }
  }

  if (input.rentCharge && remaining > 0) {
    const apply = Math.min(remaining, Number(input.rentCharge.amount));
    if (apply > 0) {
      allocations.push({
        chargeId: input.rentCharge.id,
        chargeType: "rent",
        applied: apply,
      });
      remaining -= apply;
    }
  }

  return allocations;
}

// ── Move-in receipt note formatting ─────────────────────────────────
//
// Builds the auto-generated breakdown string that lands on both the
// `payments.note` column and the receipt PDF. When the admin also
// typed a free-form note, that's appended on its own line.
export function buildMoveInNote(
  allocations: Allocation[],
  userNote?: string | null
): string {
  const parts = allocations.map(
    (a) =>
      `${a.chargeType === "admin_fee" ? "Admin Fee" : "Rent"}: $${a.applied.toFixed(2)}`
  );
  const autoNote = `Move-in payment (${parts.join(" / ")})`;
  return userNote ? `${autoNote}\n${userNote}` : autoNote;
}
