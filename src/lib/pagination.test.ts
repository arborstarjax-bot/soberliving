import { describe, expect, it } from "vitest";
import {
  buildCursorHref,
  encodeCursor,
  parseCursor,
  sliceForPage,
} from "@/lib/cursor";
import { buildPaginationMeta, getPageParams } from "@/lib/pagination";

describe("cursor pagination", () => {
  it("encodes and parses a cursor round-trip", () => {
    const c = { ts: "2026-11-20T12:00:00Z", id: "abc-123" };
    const encoded = encodeCursor(c);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(parseCursor(encoded)).toEqual(c);
  });

  it("parseCursor returns null for missing/malformed input", () => {
    expect(parseCursor(undefined)).toBeNull();
    expect(parseCursor(null)).toBeNull();
    expect(parseCursor("not-base64!!!")).toBeNull();
    expect(parseCursor(encodeCursor({ ts: "", id: "" }))).toBeNull();
  });

  it("parseCursor uses the first element of an array", () => {
    const c = { ts: "2026-01-01T00:00:00Z", id: "x" };
    expect(parseCursor([encodeCursor(c), "junk"])).toEqual(c);
  });

  it("sliceForPage returns nextCursor only when more rows remain", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: `id-${i}`,
      created_at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const page = sliceForPage(rows, 20);
    expect(page.rows).toHaveLength(20);
    expect(page.nextCursor).toEqual({ ts: "2026-01-20T00:00:00Z", id: "id-19" });

    const short = sliceForPage(rows.slice(0, 5), 20);
    expect(short.nextCursor).toBeNull();
  });

  it("buildCursorHref preserves params and swaps the cursor", () => {
    const href = buildCursorHref(
      "/residents",
      { q: "smith", c: "old", tag: ["a", "b"] },
      { ts: "t", id: "i" }
    );
    expect(href).toContain("/residents?");
    expect(href).toContain("q=smith");
    expect(href).toContain("tag=a");
    expect(href).toContain("tag=b");
    expect(href).toContain("c=");
    expect(href).not.toContain("old");
  });

  it("buildCursorHref with null cursor drops the param", () => {
    expect(buildCursorHref("/x", { c: "old" }, null)).toBe("/x");
  });
});

describe("offset pagination", () => {
  it("getPageParams defaults to page 1 and clamps invalid pages", () => {
    expect(getPageParams(undefined)).toEqual({ page: 1, offset: 0, pageSize: 20 });
    expect(getPageParams({ page: "3" })).toEqual({ page: 3, offset: 40, pageSize: 20 });
    expect(getPageParams({ page: "-5" })).toEqual({ page: 1, offset: 0, pageSize: 20 });
    expect(getPageParams({ page: "abc" })).toEqual({ page: 1, offset: 0, pageSize: 20 });
    expect(getPageParams({ page: ["2", "9"] })).toEqual({ page: 2, offset: 20, pageSize: 20 });
  });

  it("buildPaginationMeta computes ranges and nav flags", () => {
    const m = buildPaginationMeta(45, 2, 20);
    expect(m).toMatchObject({ page: 2, total: 45, totalPages: 3, from: 21, to: 40, hasPrev: true, hasNext: true });
  });

  it("buildPaginationMeta clamps past-the-end pages and handles empty", () => {
    const clamped = buildPaginationMeta(45, 99, 20);
    expect(clamped.page).toBe(3);
    expect(clamped.hasNext).toBe(false);

    const empty = buildPaginationMeta(0, 5, 20);
    expect(empty).toMatchObject({ page: 1, totalPages: 1, from: 0, to: 0 });
  });
});
