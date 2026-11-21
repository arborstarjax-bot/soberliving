import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity", () => ({ logActivity: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getWorkspaceSettings: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

import { requireAuth } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getWorkspaceSettings } from "@/lib/workspace";
import { deleteMeeting, logMeeting } from "./actions";

const authMock = vi.mocked(requireAuth);
const clientMock = vi.mocked(createClient);
const adminMock = vi.mocked(createAdminClient);
const settingsMock = vi.mocked(getWorkspaceSettings);

type Filters = Record<string, unknown>;
function fakeDb(resolve: (table: string, filters: Filters) => unknown[] | null) {
  const inserts: Record<string, unknown[]> = {};
  return {
    inserts,
    storage: {
      from: () => ({ upload: () => Promise.resolve({ error: null }) }),
    },
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
      b.insert = (row: unknown) => {
        (inserts[table] ??= []).push(row);
        return Promise.resolve({ error: null });
      };
      b.delete = () => b;
      b.maybeSingle = () =>
        Promise.resolve({ data: (resolve(table, f) ?? [])[0] ?? null });
      b.then = (onFulfilled: (v: unknown) => unknown) => run().then(onFulfilled);
      return b;
    },
    // biome-ignore lint/suspicious/noExplicitAny: test double
  } as any;
}

const residentUser = {
  id: "u1",
  role: "resident",
  workspace_id: "ws1",
  full_name: "Res One",
};
const adminUser = {
  id: "u9",
  role: "admin",
  workspace_id: "ws1",
  full_name: "Admin",
};

function fd(fields: Record<string, string | File>) {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.set(k, v);
  return d;
}

const valid = () =>
  fd({
    meeting_name: "AA Big Book",
    location: "Community Center",
    meeting_at: "2026-11-20T19:00",
    facilitator_name: "Sam",
    facilitator_signature: "data:image/png;base64,AAAA",
  });

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(residentUser);
  settingsMock.mockResolvedValue({ require_meeting_photo: false });
  const db = fakeDb((table) =>
    table === "residents"
      ? [{ id: "r1", house_id: "h1", full_name: "Res One" }]
      : []
  );
  clientMock.mockResolvedValue(db);
  adminMock.mockReturnValue(db);
});

describe("logMeeting", () => {
  it("rejects non-residents", async () => {
    authMock.mockResolvedValue(adminUser);
    expect((await logMeeting(undefined, valid())).error).toMatch(
      /only residents/i
    );
  });
  it("requires a meeting name", async () => {
    const d = valid();
    d.set("meeting_name", "");
    expect((await logMeeting(undefined, d)).error).toMatch(/name is required/i);
  });
  it("requires a location", async () => {
    const d = valid();
    d.set("location", " ");
    expect((await logMeeting(undefined, d)).error).toMatch(/location/i);
  });
  it("requires a valid date", async () => {
    const d = valid();
    d.set("meeting_at", "not-a-date");
    expect((await logMeeting(undefined, d)).error).toMatch(/date/i);
  });
  it("requires a drawn signature", async () => {
    const d = valid();
    d.set("facilitator_signature", "signed");
    expect((await logMeeting(undefined, d)).error).toMatch(/signature pad/i);
  });
  it("requires a photo when the workspace requires it", async () => {
    settingsMock.mockResolvedValue({ require_meeting_photo: true });
    expect((await logMeeting(undefined, valid())).error).toMatch(/photo/i);
  });
  it("inserts the meeting on the happy path", async () => {
    const db = fakeDb((table) =>
      table === "residents"
        ? [{ id: "r1", house_id: "h1", full_name: "Res One" }]
        : []
    );
    clientMock.mockResolvedValue(db);
    adminMock.mockReturnValue(db);
    const result = await logMeeting(undefined, valid());
    expect(result).toEqual({});
    expect(db.inserts.meetings).toHaveLength(1);
    expect(db.inserts.meetings[0]).toMatchObject({
      resident_id: "r1",
      house_id: "h1",
      meeting_name: "AA Big Book",
      facilitator_name: "Sam",
    });
  });
});

describe("deleteMeeting", () => {
  it("rejects non-admins", async () => {
    authMock.mockResolvedValue(residentUser);
    expect(
      (await deleteMeeting(undefined, fd({ meeting_id: "m1" }))).error
    ).toMatch(/not authorized/i);
  });
  it("requires a meeting id", async () => {
    authMock.mockResolvedValue(adminUser);
    expect((await deleteMeeting(undefined, fd({}))).error).toMatch(/missing/i);
  });
});
