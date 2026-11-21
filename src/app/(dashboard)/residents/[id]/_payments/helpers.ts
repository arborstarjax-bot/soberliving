// Pure display helpers shared by every sub-card in the resident
// payments panel. Intentionally dependency-free (no hooks, no React)
// so sub-components can import them without forcing a client bundle.

import { daysUntilLocal } from "@/lib/local-date";
import { formatDateOnly, formatInAppTz } from "@/lib/timezone";

export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function chargeTypeLabel(type: string): string {
  switch (type) {
    case "rent":
      return "Rent";
    case "admin_fee":
      return "Admin Fee";
    case "deposit":
      return "Deposit";
    case "misc":
      return "Misc";
    default:
      return type.replace(/_/g, " ");
  }
}

export function paymentLabel(
  type: string | null,
  method: string | null
): string {
  const parts: string[] = [];
  if (type) parts.push(chargeTypeLabel(type));
  if (method) parts.push(method);
  return parts.join(" · ") || "Payment";
}

export function formatDate(value: string): string {
  // This helper is called with a mix of date-only strings
  // (charge.due_date, terms.commitment_start_date, effective_date,
  // commitmentStartDate — all Postgres `date` columns) and full
  // timestamps (payment.paid_at — `timestamptz`). Route each to the
  // right formatter so date-only values render their stored calendar
  // day without timezone drift, while timestamps show the Eastern-time
  // day they actually occurred on.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDateOnly(value);
  }
  return formatInAppTz(value);
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function daysUntil(dateStr: string): number {
  // Uses parseIsoLocal so date-only strings ("2026-04-15") don't drift
  // a day when rendered in US Pacific. See src/lib/local-date.ts.
  return daysUntilLocal(dateStr);
}
