import { describe, expect, it, vi } from "vitest";

// server-only throws outside Next.js builds.
vi.mock("server-only", () => ({}));

import { buildFairAssignments } from "./chore-rotation";

// Minimal thenable Supabase client: records eq/in/is filters and
// resolves rows per table via the caller's resolver.
type Filters = Record<string, unknown>;
function fakeDb(resolve: (table: string, filters: Filters) => unknown[] | null) {
  return {
    from: (table: string) => {
      const f: Filters = {};
      const run = () => Promise.resolve({ data: resolve(table, f) ?? [] });
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (k: string, v: unknown) => {
        f[k] = v;
        return b;
      };
      b.in = (k: string, v: unknown) => {
        f[k] = v;
        return b;
      };
      b.is = (k: string, v: unknown) => {
        f[k] = v;
        return b;
      };
      b.order = () => run();
      b.maybeSingle = () =>
        Promise.resolve({ data: (resolve(table, f) ?? [])[0] ?? null });
      // bare `await builder` for queries with no terminal method
      b.then = (onFulfilled: (v: unknown) => unknown) => run().then(onFulfilled);
      return b;
    },
    // biome-ignore lint/suspicious/noExplicitAny: test double
  } as any;
}

const chores = (...ids: string[]) =>
  ids.map((id) => ({ id, name: id, days_of_week: null, cycle_weeks: 2 }));
const residents = (...ids: string[]) => ids.map((id) => ({ id }));

function dbWith(data: Partial<Record<string, unknown[]>>) {
  return fakeDb((table) => data[table] ?? []);
}

describe("buildFairAssignments", () => {
  it("returns empty for no chores, no residents, or empty onlyChoreIds", async () => {
    const none = dbWith({ chores: chores("c1"), residents: residents("r1") });
    expect((await buildFairAssignments(none, "h", { onlyChoreIds: [] })).size).toBe(0);

    const noChores = dbWith({ residents: residents("r1") });
    expect((await buildFairAssignments(noChores, "h")).size).toBe(0);

    const noResidents = dbWith({ chores: chores("c1") });
    expect((await buildFairAssignments(noResidents, "h")).size).toBe(0);
  });

  it("spreads chores across residents instead of stacking one", async () => {
    const db = dbWith({
      chores: chores("c1", "c2"),
      residents: residents("r1", "r2", "r3"),
    });
    const got = await buildFairAssignments(db, "h");
    expect(got.size).toBe(2);
    // Two chores, three residents: two different residents get work.
    expect(new Set(got.values()).size).toBe(2);
  });

  it("excluded residents are never picked", async () => {
    const db = dbWith({
      chores: chores("c1"),
      residents: residents("r1", "r2"),
      chore_exclusions: [{ chore_id: "c1", resident_id: "r1" }],
    });
    const got = await buildFairAssignments(db, "h");
    expect(got.get("c1")).toBe("r2");
  });

  it("room exclusions follow the resident's current bed", async () => {
    const db = dbWith({
      chores: chores("c1"),
      residents: residents("r1", "r2"),
      chore_room_exclusions: [{ chore_id: "c1", room_id: "room1" }],
      bed_assignments: [{ resident_id: "r1", bed: { room_id: "room1" } }],
    });
    const got = await buildFairAssignments(db, "h");
    expect(got.get("c1")).toBe("r2");
  });

  it("rotates: previous-cycle load feeds the tie-break", async () => {
    const db = dbWith({
      chores: chores("c1", "c2"),
      residents: residents("r1", "r2"),
      chore_rotations: [{ id: "rot1" }],
      // Last cycle r1 carried both chores.
      chore_rotation_assignments: [
        { resident_id: "r1" },
        { resident_id: "r1" },
      ],
    });
    const got = await buildFairAssignments(db, "h");
    // This cycle should hand both to r2 if possible, or at least share.
    expect(got.get("c1")).toBe("r2");
  });

  it("more residents than chores: only some get work, fairly", async () => {
    const db = dbWith({
      chores: chores("c1"),
      residents: residents("r1", "r2", "r3"),
    });
    const got = await buildFairAssignments(db, "h");
    expect(got.size).toBe(1);
    expect(["r1", "r2", "r3"]).toContain(got.get("c1"));
  });

  it("all residents excluded leaves the chore unassigned", async () => {
    const db = dbWith({
      chores: chores("c1"),
      residents: residents("r1"),
      chore_exclusions: [{ chore_id: "c1", resident_id: "r1" }],
    });
    const got = await buildFairAssignments(db, "h");
    expect(got.size).toBe(0);
  });
});
