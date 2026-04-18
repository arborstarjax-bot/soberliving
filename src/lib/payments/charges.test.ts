import { describe, expect, it } from "vitest";
import {
  addCycles,
  addMonthsClamped,
  nextDueDate,
  normalizePaymentFrequency,
  parseIsoDate,
  periodEndFor,
  toIsoDate,
} from "./charges";

// Pure date-math helpers. The goal of this suite is to pin down the
// subtle edge cases (month-end clamping, weekly cadence, DST, etc.)
// so any future refactor of the charge scheduler has a safety net.

describe("toIsoDate / parseIsoDate", () => {
  it("round-trips an ordinary date", () => {
    const d = parseIsoDate("2025-11-15");
    expect(toIsoDate(d)).toBe("2025-11-15");
  });

  it("pads single-digit month and day", () => {
    const d = parseIsoDate("2025-03-04");
    expect(toIsoDate(d)).toBe("2025-03-04");
  });

  it("parses at local midnight so rendered date matches stored date", () => {
    // Regression for the "new Date('2025-11-15') is UTC midnight" bug
    // that rendered as the previous day in Eastern.
    const d = parseIsoDate("2025-11-15");
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(10); // November, 0-indexed
    expect(d.getDate()).toBe(15);
  });
});

describe("normalizePaymentFrequency", () => {
  it("returns 'weekly' for the weekly literal", () => {
    expect(normalizePaymentFrequency("weekly")).toBe("weekly");
  });

  it("defaults to monthly for anything else", () => {
    expect(normalizePaymentFrequency("monthly")).toBe("monthly");
    expect(normalizePaymentFrequency(null)).toBe("monthly");
    expect(normalizePaymentFrequency(undefined)).toBe("monthly");
    expect(normalizePaymentFrequency("")).toBe("monthly");
    expect(normalizePaymentFrequency("WEEKLY")).toBe("monthly");
  });
});

describe("addMonthsClamped", () => {
  it("advances by the given number of months", () => {
    const start = parseIsoDate("2025-01-15");
    expect(toIsoDate(addMonthsClamped(start, 1))).toBe("2025-02-15");
    expect(toIsoDate(addMonthsClamped(start, 6))).toBe("2025-07-15");
  });

  it("clamps the day down when the target month is shorter", () => {
    // Jan 31 + 1 month should not roll into March.
    const jan31 = parseIsoDate("2025-01-31");
    expect(toIsoDate(addMonthsClamped(jan31, 1))).toBe("2025-02-28");
    const mar31 = parseIsoDate("2025-03-31");
    expect(toIsoDate(addMonthsClamped(mar31, 1))).toBe("2025-04-30");
  });

  it("handles leap-year February correctly", () => {
    const jan31_2024 = parseIsoDate("2024-01-31");
    expect(toIsoDate(addMonthsClamped(jan31_2024, 1))).toBe("2024-02-29");
  });

  it("crosses year boundaries", () => {
    const nov15 = parseIsoDate("2025-11-15");
    expect(toIsoDate(addMonthsClamped(nov15, 3))).toBe("2026-02-15");
  });
});

describe("addCycles (weekly)", () => {
  it("adds 7 days per cycle", () => {
    const start = parseIsoDate("2025-01-01"); // Wednesday
    expect(toIsoDate(addCycles(start, 1, "weekly"))).toBe("2025-01-08");
    expect(toIsoDate(addCycles(start, 4, "weekly"))).toBe("2025-01-29");
  });

  it("preserves the weekday across cycles", () => {
    const start = parseIsoDate("2025-06-01"); // Sunday
    const result = addCycles(start, 10, "weekly");
    expect(result.getDay()).toBe(start.getDay());
  });
});

describe("addCycles (monthly)", () => {
  it("delegates to addMonthsClamped", () => {
    const start = parseIsoDate("2025-01-31");
    expect(toIsoDate(addCycles(start, 1, "monthly"))).toBe("2025-02-28");
    expect(toIsoDate(addCycles(start, 13, "monthly"))).toBe("2026-02-28");
  });
});

describe("periodEndFor", () => {
  it("is one cycle after due for monthly", () => {
    const due = parseIsoDate("2025-03-15");
    expect(toIsoDate(periodEndFor(due, "monthly"))).toBe("2025-04-15");
  });

  it("is 7 days after due for weekly", () => {
    const due = parseIsoDate("2025-03-15");
    expect(toIsoDate(periodEndFor(due, "weekly"))).toBe("2025-03-22");
  });
});

describe("nextDueDate — monthly", () => {
  const start = parseIsoDate("2025-01-15");

  it("returns the commitment start when nothing has been scheduled yet", () => {
    expect(toIsoDate(nextDueDate(start, [], "monthly"))).toBe("2025-01-15");
  });

  it("returns the next month when one cycle already exists", () => {
    expect(
      toIsoDate(nextDueDate(start, [parseIsoDate("2025-01-15")], "monthly"))
    ).toBe("2025-02-15");
  });

  it("picks up from the most recent existing due date", () => {
    const existing = [
      parseIsoDate("2025-01-15"),
      parseIsoDate("2025-02-15"),
      parseIsoDate("2025-03-15"),
    ];
    expect(toIsoDate(nextDueDate(start, existing, "monthly"))).toBe(
      "2025-04-15"
    );
  });

  it("handles month-shortening correctly when anchor is day 31", () => {
    const start31 = parseIsoDate("2025-01-31");
    const existing = [parseIsoDate("2025-01-31")];
    // Feb has 28 days → clamps to 28.
    expect(toIsoDate(nextDueDate(start31, existing, "monthly"))).toBe(
      "2025-02-28"
    );
    // Then March should return to 31, not continue clamped to 28.
    expect(
      toIsoDate(
        nextDueDate(start31, [...existing, parseIsoDate("2025-02-28")], "monthly")
      )
    ).toBe("2025-03-31");
  });
});

describe("nextDueDate — weekly", () => {
  const start = parseIsoDate("2025-06-01"); // Sunday

  it("returns the commitment start when nothing scheduled", () => {
    expect(toIsoDate(nextDueDate(start, [], "weekly"))).toBe("2025-06-01");
  });

  it("advances by 7 days each cycle", () => {
    expect(
      toIsoDate(nextDueDate(start, [parseIsoDate("2025-06-01")], "weekly"))
    ).toBe("2025-06-08");
  });

  it("computes cycle count from the most recent existing due", () => {
    const existing = [
      parseIsoDate("2025-06-01"),
      parseIsoDate("2025-06-08"),
      parseIsoDate("2025-06-15"),
    ];
    expect(toIsoDate(nextDueDate(start, existing, "weekly"))).toBe(
      "2025-06-22"
    );
  });

  it("recovers the correct next cycle even if an intermediate cycle is missing", () => {
    // Only the start and week 3 exist; the opener should still march
    // forward from the max (week 3) by 7 days, not infer back-fill.
    const existing = [
      parseIsoDate("2025-06-01"),
      parseIsoDate("2025-06-22"),
    ];
    expect(toIsoDate(nextDueDate(start, existing, "weekly"))).toBe(
      "2025-06-29"
    );
  });
});

describe("nextDueDate — DST boundaries (America/New_York)", () => {
  // These are the dates US/Eastern crosses DST in 2025. Using local-
  // midnight Date construction (via parseIsoDate) should keep weekly
  // cadence exactly 7 calendar days apart across the transitions.
  it("spring-forward does not shift weekly cadence", () => {
    // 2025 spring-forward: Sun Mar 9.
    const start = parseIsoDate("2025-03-02"); // Sunday before.
    expect(
      toIsoDate(nextDueDate(start, [parseIsoDate("2025-03-02")], "weekly"))
    ).toBe("2025-03-09");
    expect(
      toIsoDate(nextDueDate(start, [parseIsoDate("2025-03-09")], "weekly"))
    ).toBe("2025-03-16");
  });

  it("fall-back does not shift weekly cadence", () => {
    // 2025 fall-back: Sun Nov 2.
    const start = parseIsoDate("2025-10-26");
    expect(
      toIsoDate(nextDueDate(start, [parseIsoDate("2025-10-26")], "weekly"))
    ).toBe("2025-11-02");
    expect(
      toIsoDate(nextDueDate(start, [parseIsoDate("2025-11-02")], "weekly"))
    ).toBe("2025-11-09");
  });
});
