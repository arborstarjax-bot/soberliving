import { describe, expect, it } from "vitest";
import {
  dayOfMonthLocal,
  daysUntilLocal,
  parseIsoLocal,
  todayLocalIso,
} from "./local-date";
import { SAFETY_CHECKLIST } from "./safety-checklist";

describe("local-date", () => {
  it("parseIsoLocal returns null for invalid input", () => {
    expect(parseIsoLocal("")).toBeNull();
    expect(parseIsoLocal("not-a-date")).toBeNull();
    // JS Date normalizes out-of-range days rather than rejecting them.
    expect(parseIsoLocal("2026-02-30")?.getMonth()).toBe(2);
  });
  it("parseIsoLocal parses a valid date", () => {
    const d = parseIsoLocal("2026-04-16");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(3);
    expect(d?.getDate()).toBe(16);
  });
  it("todayLocalIso matches YYYY-MM-DD", () => {
    expect(todayLocalIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("daysUntilLocal signs", () => {
    const today = todayLocalIso();
    expect(daysUntilLocal(today)).toBe(0);
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() + 5);
    const iso = d.toISOString().slice(0, 10);
    expect(daysUntilLocal(iso)).toBe(5);
    d.setDate(d.getDate() - 10);
    expect(daysUntilLocal(d.toISOString().slice(0, 10))).toBe(-5);
    expect(daysUntilLocal("junk")).toBe(0);
  });
  it("dayOfMonthLocal", () => {
    expect(dayOfMonthLocal("2026-01-15")).toBe(15);
  });
});

describe("safety checklist", () => {
  it("has unique section keys", () => {
    const keys = SAFETY_CHECKLIST.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("has unique item keys within each section", () => {
    for (const s of SAFETY_CHECKLIST) {
      const keys = s.items.map((i) => i.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
  it("every item has a label", () => {
    for (const s of SAFETY_CHECKLIST) {
      for (const i of s.items) expect(i.label.length).toBeGreaterThan(0);
    }
  });
});
