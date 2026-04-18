import { describe, expect, it } from "vitest";
import {
  allocateMoveInPayment,
  buildInitialCharges,
  buildMoveInNote,
  normalizeSobrietyDate,
} from "./intake-activation";

// Pure helpers extracted from completeIntakeReview in
// intake-review/actions.ts. These tests pin down the exact behaviour
// so the refactor is provably a zero-behavior-change split.

describe("normalizeSobrietyDate", () => {
  const now = new Date("2025-06-15T12:00:00-04:00");

  it("returns null for empty input", () => {
    expect(normalizeSobrietyDate(null, now)).toBeNull();
    expect(normalizeSobrietyDate(undefined, now)).toBeNull();
    expect(normalizeSobrietyDate("", now)).toBeNull();
  });

  it("returns null for unparseable dates", () => {
    expect(normalizeSobrietyDate("not-a-date", now)).toBeNull();
  });

  it("returns the ISO string for valid past dates", () => {
    expect(normalizeSobrietyDate("2024-01-01", now)).toBe("2024-01-01");
    expect(normalizeSobrietyDate("2020-12-31", now)).toBe("2020-12-31");
  });

  it("accepts today as valid (not treated as future)", () => {
    expect(normalizeSobrietyDate("2025-06-15", now)).toBe("2025-06-15");
  });

  it("returns null for future dates", () => {
    expect(normalizeSobrietyDate("2025-06-16", now)).toBeNull();
    expect(normalizeSobrietyDate("2099-01-01", now)).toBeNull();
  });
});

describe("buildInitialCharges", () => {
  const base = {
    residentId: "res-1",
    houseId: "house-1",
    commitmentId: "commit-1",
    commitmentStartDate: "2025-06-01",
    rentAmount: 225,
    adminFee: 200,
    frequency: "weekly" as const,
    existingTenant: false,
  };

  it("returns empty array for existing-tenant activation", () => {
    const rows = buildInitialCharges({ ...base, existingTenant: true });
    expect(rows).toEqual([]);
  });

  it("omits admin-fee row when adminFee is 0", () => {
    const rows = buildInitialCharges({ ...base, adminFee: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0].charge_type).toBe("rent");
  });

  it("emits admin-fee + rent rows for normal new-intake", () => {
    const rows = buildInitialCharges(base);
    expect(rows).toHaveLength(2);
    expect(rows[0].charge_type).toBe("admin_fee");
    expect(rows[0].amount).toBe(200);
    expect(rows[0].due_date).toBe("2025-06-01");
    expect(rows[0].period_start).toBeUndefined();
    expect(rows[1].charge_type).toBe("rent");
    expect(rows[1].amount).toBe(225);
    expect(rows[1].due_date).toBe("2025-06-01");
  });

  it("computes rent period end from frequency (weekly = +7d)", () => {
    const rows = buildInitialCharges({ ...base, frequency: "weekly" });
    const rent = rows.find((r) => r.charge_type === "rent");
    expect(rent?.period_start).toBe("2025-06-01");
    expect(rent?.period_end).toBe("2025-06-08");
  });

  it("computes rent period end from frequency (monthly = +1 month)", () => {
    const rows = buildInitialCharges({ ...base, frequency: "monthly" });
    const rent = rows.find((r) => r.charge_type === "rent");
    expect(rent?.period_start).toBe("2025-06-01");
    expect(rent?.period_end).toBe("2025-07-01");
  });

  it("pins all rows to the commitment/resident/house ids", () => {
    const rows = buildInitialCharges(base);
    for (const r of rows) {
      expect(r.resident_id).toBe("res-1");
      expect(r.house_id).toBe("house-1");
      expect(r.commitment_id).toBe("commit-1");
    }
  });
});

describe("allocateMoveInPayment", () => {
  const adminFee = { id: "af-1", amount: 200 };
  const rent = { id: "rent-1", amount: 225 };

  it("applies admin fee first, remainder to rent", () => {
    const allocations = allocateMoveInPayment({
      amount: 425,
      adminFeeCharge: adminFee,
      rentCharge: rent,
    });
    expect(allocations).toEqual([
      { chargeId: "af-1", chargeType: "admin_fee", applied: 200 },
      { chargeId: "rent-1", chargeType: "rent", applied: 225 },
    ]);
  });

  it("caps admin-fee allocation at the charge amount", () => {
    // Even if the admin pays $1000 at move-in, admin fee row stays $200.
    const allocations = allocateMoveInPayment({
      amount: 1000,
      adminFeeCharge: adminFee,
      rentCharge: rent,
    });
    expect(allocations[0].applied).toBe(200);
    expect(allocations[1].applied).toBe(225);
    // The remaining $575 isn't allocated anywhere by this function; the
    // caller is responsible for treating overpayment as a credit or
    // leaving it on the payments row.
  });

  it("handles partial-admin payment with no rent allocation", () => {
    const allocations = allocateMoveInPayment({
      amount: 100,
      adminFeeCharge: adminFee,
      rentCharge: rent,
    });
    expect(allocations).toHaveLength(1);
    expect(allocations[0]).toEqual({
      chargeId: "af-1",
      chargeType: "admin_fee",
      applied: 100,
    });
  });

  it("handles admin-fee-fully-paid, partial rent", () => {
    const allocations = allocateMoveInPayment({
      amount: 300, // 200 admin + 100 rent
      adminFeeCharge: adminFee,
      rentCharge: rent,
    });
    expect(allocations).toEqual([
      { chargeId: "af-1", chargeType: "admin_fee", applied: 200 },
      { chargeId: "rent-1", chargeType: "rent", applied: 100 },
    ]);
  });

  it("skips admin-fee when the charge is absent (existing tenant)", () => {
    const allocations = allocateMoveInPayment({
      amount: 225,
      adminFeeCharge: null,
      rentCharge: rent,
    });
    expect(allocations).toEqual([
      { chargeId: "rent-1", chargeType: "rent", applied: 225 },
    ]);
  });

  it("skips rent when the charge is absent", () => {
    const allocations = allocateMoveInPayment({
      amount: 200,
      adminFeeCharge: adminFee,
      rentCharge: null,
    });
    expect(allocations).toEqual([
      { chargeId: "af-1", chargeType: "admin_fee", applied: 200 },
    ]);
  });

  it("returns empty array for zero amount", () => {
    const allocations = allocateMoveInPayment({
      amount: 0,
      adminFeeCharge: adminFee,
      rentCharge: rent,
    });
    expect(allocations).toEqual([]);
  });

  it("returns empty array when both charges are absent", () => {
    const allocations = allocateMoveInPayment({
      amount: 100,
      adminFeeCharge: null,
      rentCharge: null,
    });
    expect(allocations).toEqual([]);
  });
});

describe("buildMoveInNote", () => {
  it("formats a single admin-fee allocation", () => {
    const note = buildMoveInNote([
      { chargeId: "x", chargeType: "admin_fee", applied: 200 },
    ]);
    expect(note).toBe("Move-in payment (Admin Fee: $200.00)");
  });

  it("formats admin-fee + rent with a slash separator", () => {
    const note = buildMoveInNote([
      { chargeId: "x", chargeType: "admin_fee", applied: 200 },
      { chargeId: "y", chargeType: "rent", applied: 225 },
    ]);
    expect(note).toBe("Move-in payment (Admin Fee: $200.00 / Rent: $225.00)");
  });

  it("always renders 2-decimal amounts", () => {
    const note = buildMoveInNote([
      { chargeId: "x", chargeType: "rent", applied: 100 },
    ]);
    expect(note).toContain("$100.00");
  });

  it("appends user-supplied note on its own line", () => {
    const note = buildMoveInNote(
      [{ chargeId: "x", chargeType: "admin_fee", applied: 200 }],
      "Paid in cash — 2 $100 bills"
    );
    expect(note).toBe(
      "Move-in payment (Admin Fee: $200.00)\nPaid in cash — 2 $100 bills"
    );
  });

  it("omits user-note line when note is empty or null", () => {
    const base = "Move-in payment (Rent: $225.00)";
    const allocations = [
      { chargeId: "x", chargeType: "rent" as const, applied: 225 },
    ];
    expect(buildMoveInNote(allocations)).toBe(base);
    expect(buildMoveInNote(allocations, null)).toBe(base);
    expect(buildMoveInNote(allocations, "")).toBe(base);
  });
});
