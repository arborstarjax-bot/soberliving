// Shared types for the resident payments panel and its sub-cards.
// Kept permissive (string union types for status/type columns) so the
// parent page can pass raw Supabase row shapes through without extra
// mapping. Fields line up with payment_charges / payments columns.

export interface OpenCharge {
  id: string;
  charge_type: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  status: string;
}

export interface RecentPayment {
  id: string;
  amount: number;
  payment_type: string | null;
  payment_method: string | null;
  paid_at: string;
  status: string;
  receipt_number: string | null;
  receipt_storage_path: string | null;
  note: string | null;
}

export interface PaymentTerms {
  // Passed through so "Pay Upcoming Rent" can materialize the next
  // rent charge on demand via the server action.
  commitment_id: string;
  rent_amount: number;
  admin_fee: number | null;
  payment_frequency: "weekly" | "monthly";
  commitment_start_date: string;
  pdf_storage_path: string | null;
}

export interface PendingAmendment {
  id: string;
  rent_amount: number;
  admin_fee: number | null;
  effective_date: string | null;
  amendment_reason: string | null;
  created_at: string;
  // Included on pending amendments so the Next Rent card can project
  // the upcoming cycle off the amendment's new anchor instead of the
  // active commitment's stale schedule (e.g. weekly Sunday cadence
  // being replaced by Friday). Null for historical rows that predate
  // the column being queried.
  payment_frequency: "weekly" | "monthly" | null;
}

export interface PendingInitialCommitment {
  id: string;
  paymentFrequency: "weekly" | "monthly";
  rentAmount: number;
  adminFee: number;
  commitmentStartDate: string;
  commitmentTerm: string;
  rentDueDate: string | null;
  notes: string | null;
}
