import { describe, expect, it } from "vitest";
import { encodeCursor, parseCursor } from "./cursor";
import { getPageParams, buildPaginationMeta } from "./pagination";
import { countCheckedItems, SAFETY_CHECKLIST } from "./safety-checklist";
import { milestoneLabel, milestonesPassed } from "./sobriety-milestones";

describe("cursor", () => {
  it("encode/parse round-trips", () => {
    const c = { ts: "2026-11-20T12:00:00Z", id: "abc-123" };
    expect(parseCursor(encodeCursor(c))).toEqual(c);
  });

  it("parse tolerates missing, malformed and non-object input", () => {
    expect(parseCursor(null)).toBeNull();
    expect(parseCursor(undefined)).toBeNull();
    expect(parseCursor("")).toBeNull();
    expect(parseCursor("!!!not-base64!!!")).toBeNull();
    expect(parseCursor(Buffer.from('"just a string"').toString("base64url"))).toBeNull();
    expect(parseCursor(Buffer.from('{"ts":""}').toString("base64url"))).toBeNull();
    expect(parseCursor(Buffer.from('{"ts":"x"}').toString("base64url"))).toBeNull();
  });

  it("parse takes the first of an array param", () => {
    const c = { ts: "t", id: "i" };
    const enc = encodeCursor(c);
    expect(parseCursor([enc, "junk"])).toEqual(c);
  });
});

describe("pagination", () => {
  it("getPageParams defaults to page 1 and clamps garbage", () => {
    expect(getPageParams(undefined)).toEqual({ page: 1, offset: 0, pageSize: 20 });
    expect(getPageParams({ page: "3" })).toEqual({ page: 3, offset: 40, pageSize: 20 });
    expect(getPageParams({ page: "0" }).page).toBe(1);
    expect(getPageParams({ page: "-2" }).page).toBe(1);
    expect(getPageParams({ page: "abc" }).page).toBe(1);
    expect(getPageParams({ page: ["2", "9"] }).page).toBe(2);
  });

  it("buildPaginationMeta clamps page into range", () => {
    const meta = buildPaginationMeta(45, 9, 20);
    expect(meta.page).toBe(3);
    expect(meta.totalPages).toBe(3);
    expect(meta.from).toBe(41);
    expect(meta.to).toBe(45);
    expect(meta.hasPrev).toBe(true);
    expect(meta.hasNext).toBe(false);
  });

  it("empty list still reports one page with zero items", () => {
    const meta = buildPaginationMeta(0, 1);
    expect(meta).toMatchObject({ totalPages: 1, from: 0, to: 0, hasPrev: false, hasNext: false });
  });
});

describe("safety checklist", () => {
  it("counts only true responses", () => {
    const first = SAFETY_CHECKLIST[0];
    const item = first.items[0];
    const { checked, total } = countCheckedItems({
      [first.key]: { [item.key]: true, bogus: true },
      other: { [item.key]: true },
    });
    expect(checked).toBe(1);
    const all = SAFETY_CHECKLIST.reduce((t, s) => t + s.items.length, 0);
    expect(total).toBe(all);
  });
});

describe("sobriety milestones", () => {
  it("labels fixed days and yearly anniversaries", () => {
    expect(milestoneLabel(30)).toContain("30");
    expect(milestoneLabel(365)).toContain("year");
    expect(milestoneLabel(730)).toBe("2 years sober");
    expect(milestoneLabel(999)).toBe("999 days sober");
  });

  it("milestonesPassed handles null, bad and future dates", () => {
    expect(milestonesPassed(null)).toEqual([]);
    expect(milestonesPassed("not-a-date")).toEqual([]);
    expect(milestonesPassed("2999-01-01")).toEqual([]);
  });

  it("milestonesPassed emits fixed days then yearly", () => {
    const start = new Date();
    start.setDate(start.getDate() - 400);
    const got = milestonesPassed(start.toISOString().slice(0, 10));
    expect(got).toContain(30);
    expect(got).toContain(365);
    expect(got).not.toContain(730);
    expect([...got].sort((a, b) => a - b)).toEqual(got);
  });
});
