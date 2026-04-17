// Local-date helpers. Date-only ISO strings ("2026-04-15") parsed with
// `new Date(str)` are interpreted as UTC midnight — in US Pacific that
// resolves to the previous calendar day, which causes off-by-one bugs
// in "days until due" math, due-day extraction, and today-comparisons.
// These helpers always work in local time.

// Parse an ISO date-only string ("YYYY-MM-DD") as a local Date at
// midnight local time. Returns `null` for malformed input.
export function parseIsoLocal(iso: string): Date | null {
  if (!iso || typeof iso !== "string") return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Today in local time as "YYYY-MM-DD". Safe to compare against
// `payment_charges.due_date` which is stored as a DATE column.
export function todayLocalIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Number of whole days between `iso` (YYYY-MM-DD) and today, using
// local calendar days. Positive = future, 0 = today, negative = past.
export function daysUntilLocal(iso: string): number {
  const due = parseIsoLocal(iso);
  if (!due) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

// Pull the day-of-month out of a date-only ISO string without the
// UTC-drift bug that `new Date(iso).getDate()` has.
export function dayOfMonthLocal(iso: string): number {
  const d = parseIsoLocal(iso);
  return d ? d.getDate() : 1;
}
