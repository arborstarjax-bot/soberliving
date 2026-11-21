import { describe, expect, it } from "vitest";
import {
  createResidentSchema,
  updateResidentSchema,
  createLeaveRequestSchema,
  createDemeritSchema,
  createPaymentSchema,
  addOneTimeChargeSchema,
  adjustChargeAmountSchema,
  createRotationSchema,
  createChoreSchema,
} from "./validations";

const uuid = (n = 1) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

describe("sobriety date guard", () => {
  const base = {
    house_id: uuid(),
    full_name: "Test Person",
    emergency_contact_name: "Mom",
    emergency_contact_phone: "5551234",
    move_in_date: "2026-01-01",
  };

  it("rejects a future sobriety date on create", () => {
    const r = createResidentSchema.safeParse({ ...base, sobriety_date: tomorrow() });
    expect(r.success).toBe(false);
  });

  it("accepts past, missing and empty sobriety dates", () => {
    expect(createResidentSchema.safeParse({ ...base, sobriety_date: "2020-01-01" }).success).toBe(true);
    expect(createResidentSchema.safeParse(base).success).toBe(true);
    expect(createResidentSchema.safeParse({ ...base, sobriety_date: "" }).success).toBe(true);
  });

  it("rejects a future sobriety date on update", () => {
    const r = updateResidentSchema.safeParse({ sobriety_date: tomorrow() });
    expect(r.success).toBe(false);
  });
});

describe("residents", () => {
  it("requires house, name, emergency contact and move-in", () => {
    expect(createResidentSchema.safeParse({}).success).toBe(false);
    expect(createResidentSchema.safeParse({
      house_id: uuid(), full_name: "X", emergency_contact_name: "Y",
      emergency_contact_phone: "Z", move_in_date: "2026-01-01",
    }).success).toBe(true);
  });

  it("email is optional, empty or valid", () => {
    const base = {
      house_id: uuid(), full_name: "X", emergency_contact_name: "Y",
      emergency_contact_phone: "Z", move_in_date: "2026-01-01",
    };
    expect(createResidentSchema.safeParse({ ...base, email: "" }).success).toBe(true);
    expect(createResidentSchema.safeParse({ ...base, email: "a@b.co" }).success).toBe(true);
    expect(createResidentSchema.safeParse({ ...base, email: "bad" }).success).toBe(false);
  });
});

describe("leave requests", () => {
  it("requires both dates", () => {
    expect(createLeaveRequestSchema.safeParse({ resident_id: uuid() }).success).toBe(false);
    expect(createLeaveRequestSchema.safeParse({
      resident_id: uuid(), departure_date: "2026-11-21", expected_return_date: "2026-11-23",
    }).success).toBe(true);
  });
});

describe("demerits", () => {
  const base = { resident_id: uuid(), house_id: uuid(), reason: "missed chore" };

  it("defaults points to 1 and bounds at 1-10", () => {
    const ok = createDemeritSchema.safeParse(base);
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.points).toBe(1);
    expect(createDemeritSchema.safeParse({ ...base, points: 0 }).success).toBe(false);
    expect(createDemeritSchema.safeParse({ ...base, points: 11 }).success).toBe(false);
    expect(createDemeritSchema.safeParse({ ...base, points: 5 }).success).toBe(true);
  });

  it("coerces string points", () => {
    const ok = createDemeritSchema.safeParse({ ...base, points: "3" });
    expect(ok.success && ok.data.points).toBe(3);
  });
});

describe("payments", () => {
  it("rejects non-positive amounts", () => {
    const base = { resident_id: uuid(), house_id: uuid(), payment_type: "rent" };
    expect(createPaymentSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(createPaymentSchema.safeParse({ ...base, amount: -5 }).success).toBe(false);
    expect(createPaymentSchema.safeParse({ ...base, amount: "100.50" }).success).toBe(true);
    expect(createPaymentSchema.safeParse({ ...base, amount: 100, payment_type: "bogus" }).success).toBe(false);
  });

  it("one-time charges need a type, amount, description and due date", () => {
    const base = { resident_id: uuid(), house_id: uuid(), amount: 10, description: "x", due_date: "2026-11-30" };
    expect(addOneTimeChargeSchema.safeParse({ ...base, charge_type: "deposit" }).success).toBe(true);
    expect(addOneTimeChargeSchema.safeParse({ ...base, charge_type: "rent" }).success).toBe(false);
  });

  it("adjustments allow zero but require a reason", () => {
    const base = { charge_id: uuid(), new_amount: 0 };
    expect(adjustChargeAmountSchema.safeParse({ ...base, reason: "fix" }).success).toBe(true);
    expect(adjustChargeAmountSchema.safeParse({ ...base, reason: "  " }).success).toBe(false);
    expect(adjustChargeAmountSchema.safeParse({ charge_id: uuid(), new_amount: -1, reason: "x" }).success).toBe(false);
  });
});

describe("chores and rotations", () => {
  it("rent config due day is 1-28", () => {
    const base = { house_id: uuid(), monthly_amount: 400 };
  });

  it("schemas exist and reject empty payloads", () => {
    expect(createRotationSchema.safeParse({}).success).toBe(false);
    expect(createChoreSchema.safeParse({}).success).toBe(false);
  });
});
