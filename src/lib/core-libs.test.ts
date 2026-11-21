import { describe, expect, it, vi } from "vitest";

// server-only throws outside Next.js builds.
vi.mock("server-only", () => ({}));
import { isModuleEnabled, isModuleVisibleToRole, WORKSPACE_MODULES } from "./modules";
import { isReminderEnabled, reminderTiming, REMINDER_TYPES } from "./reminders";
import { canAccessHouse, getAccessibleHouseFilter, getRoleLabel } from "./permissions";
import {
  addCalendarDays,
  getHouseYesterday,
  isoDateInTz,
  startOfDayInTz,
  endOfDayInTz,
  getHouseFirstOfMonth,
} from "./timezone";
import {
  calculateMilestones,
  getDaysSober,
  isSobrietyDateFuture,
  getNextMilestone,
} from "./milestones";
import { buildSignoffRows } from "./chore-rotation";
import type { SessionUser } from "./types";

describe("modules", () => {
  it("every module slug is unique", () => {
    const slugs = WORKSPACE_MODULES.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("isModuleEnabled defaults to true with no settings", () => {
    expect(isModuleEnabled(null, "chores")).toBe(true);
    expect(isModuleEnabled(undefined, "ua")).toBe(true);
    expect(isModuleEnabled({}, "meetings")).toBe(true);
  });

  it("isModuleEnabled respects the enabled list", () => {
    const s = { enabled_modules: ["chores"] };
    expect(isModuleEnabled(s, "chores")).toBe(true);
    expect(isModuleEnabled(s, "bulletin")).toBe(false);
  });

  it("staff visibility ignores resident_modules", () => {
    const s = { enabled_modules: ["chores"], resident_modules: [] };
    expect(isModuleVisibleToRole(s, "chores", "admin")).toBe(true);
    expect(isModuleVisibleToRole(s, "chores", "manager")).toBe(true);
  });

  it("resident visibility requires listing when resident_modules is set", () => {
    const s = { enabled_modules: ["chores", "meetings"], resident_modules: ["meetings"] };
    expect(isModuleVisibleToRole(s, "meetings", "resident")).toBe(true);
    expect(isModuleVisibleToRole(s, "chores", "resident")).toBe(false);
  });

  it("resident sees everything when resident_modules is null", () => {
    const s = { enabled_modules: ["chores"], resident_modules: null };
    expect(isModuleVisibleToRole(s, "chores", "resident")).toBe(true);
  });

  it("disabled module is hidden from every role", () => {
    const s = { enabled_modules: [], resident_modules: ["chores"] };
    expect(isModuleVisibleToRole(s, "chores", "admin")).toBe(false);
    expect(isModuleVisibleToRole(s, "chores", "resident")).toBe(false);
  });
});

describe("reminders", () => {
  it("every reminder slug is unique", () => {
    const slugs = REMINDER_TYPES.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("reminders default to enabled", () => {
    expect(isReminderEnabled(null, "chore")).toBe(true);
    expect(isReminderEnabled({ reminder_settings: {} }, "rent")).toBe(true);
    expect(isReminderEnabled({ reminder_settings: { curfew: {} } }, "curfew")).toBe(true);
  });

  it("explicit false disables", () => {
    const s = { reminder_settings: { chore: { enabled: false } } };
    expect(isReminderEnabled(s, "chore")).toBe(false);
    expect(isReminderEnabled(s, "rent")).toBe(true);
  });

  it("timing defaults to day_of", () => {
    expect(reminderTiming(null, "rent")).toBe("day_of");
    expect(reminderTiming({ reminder_settings: { rent: { timing: "day_of" } } }, "rent")).toBe("day_of");
    expect(reminderTiming({ reminder_settings: { rent: { timing: "day_before" } } }, "rent")).toBe("day_before");
    expect(reminderTiming({ reminder_settings: { rent: { timing: "bogus" } } }, "rent")).toBe("day_of");
  });
});

const baseUser = (over: Partial<SessionUser>): SessionUser =>
  ({
    id: "u1",
    role: "resident",
    workspace_id: "w1",
    workspace_house_ids: ["h1", "h2"],
    assigned_house_ids: ["h2"],
    ...over,
  }) as SessionUser;

describe("permissions", () => {
  it("admin accesses only workspace houses", () => {
    const admin = baseUser({ role: "admin" });
    expect(canAccessHouse(admin, "h1")).toBe(true);
    expect(canAccessHouse(admin, "h3")).toBe(false);
  });

  it("admin without workspace accesses nothing (fail closed)", () => {
    const admin = baseUser({ role: "admin", workspace_id: null });
    expect(canAccessHouse(admin, "anywhere")).toBe(false);
  });

  it("manager accesses only assigned houses", () => {
    const mgr = baseUser({ role: "manager" });
    expect(canAccessHouse(mgr, "h2")).toBe(true);
    expect(canAccessHouse(mgr, "h1")).toBe(false);
  });

  it("resident accesses no houses via staff filter", () => {
    const res = baseUser({ role: "resident" });
    expect(canAccessHouse(res, "h1")).toBe(false);
    expect(getAccessibleHouseFilter(res)).toEqual([]);
  });

  it("house filters per role", () => {
    expect(getAccessibleHouseFilter(baseUser({ role: "admin" }))).toEqual(["h1", "h2"]);
    expect(getAccessibleHouseFilter(baseUser({ role: "admin", workspace_id: null }))).toEqual([]);
    expect(getAccessibleHouseFilter(baseUser({ role: "manager" }))).toEqual(["h2"]);
  });

  it("role labels", () => {
    expect(getRoleLabel("admin")).toBe("Admin");
    expect(getRoleLabel("manager")).toBe("Manager");
    expect(getRoleLabel("resident")).toBe("Resident");
  });
});

describe("timezone", () => {
  it("addCalendarDays walks forward and back across month ends", () => {
    expect(addCalendarDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addCalendarDays("2026-11-20", 11)).toBe("2026-12-01");
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addCalendarDays("2026-11-20", 0)).toBe("2026-11-20");
  });

  it("getHouseYesterday is the day before today in the zone", () => {
    const y = getHouseYesterday("America/New_York");
    expect(y).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("isoDateInTz converts timestamps across date boundaries", () => {
    // 2026-11-21 02:00 UTC is still 2026-11-20 in New York (UTC-5)
    expect(isoDateInTz("2026-11-21T02:00:00Z", "America/New_York")).toBe("2026-11-20");
    expect(isoDateInTz("2026-11-21T12:00:00Z", "America/New_York")).toBe("2026-11-21");
  });

  it("startOfDayInTz returns the UTC instant of local midnight", () => {
    expect(startOfDayInTz("2026-04-16", "America/Los_Angeles")).toBe("2026-04-16T07:00:00.000Z");
    expect(startOfDayInTz("2026-01-15", "America/New_York")).toBe("2026-01-15T05:00:00.000Z");
  });

  it("endOfDayInTz is 24h-ish after start and renders back to same date", () => {
    const end = endOfDayInTz("2026-04-16", "America/Los_Angeles");
    expect(isoDateInTz(end, "America/Los_Angeles")).toBe("2026-04-16");
  });

  it("getHouseFirstOfMonth returns the first", () => {
    expect(getHouseFirstOfMonth()).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

describe("milestones", () => {
  it("days sober floors at 0 for future dates", () => {
    expect(getDaysSober("2999-01-01")).toBe(0);
    expect(isSobrietyDateFuture("2999-01-01")).toBe(true);
    expect(isSobrietyDateFuture("2000-01-01")).toBe(false);
  });

  it("days sober counts a past date", () => {
    const past = new Date();
    past.setDate(past.getDate() - 30);
    const iso = past.toISOString().slice(0, 10);
    expect(getDaysSober(iso)).toBe(30);
  });

  it("milestones mark reached by elapsed days", () => {
    const past = new Date();
    past.setDate(past.getDate() - 45);
    const ms = calculateMilestones(past.toISOString().slice(0, 10));
    const m30 = ms.find((m) => m.days === 30);
    const m90 = ms.find((m) => m.days === 90);
    if (m30) expect(m30.reached).toBe(true);
    if (m90) expect(m90.reached).toBe(false);
  });

  it("next milestone is the first unreached", () => {
    const next = getNextMilestone("2999-01-01");
    expect(next).not.toBeNull();
    expect(next!.reached).toBe(false);
  });
});

describe("buildSignoffRows", () => {
  it("emits rows only on scheduled days within the cycle", () => {
    // 2026-11-16 is a Monday. MWF cycle, 2 weeks.
    const rows = buildSignoffRows("ra1", "2026-11-16", {
      days_of_week: ["monday", "wednesday", "friday"],
      cycle_weeks: 2,
    });
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.day_of_week)).toEqual([
      "monday", "wednesday", "friday", "monday", "wednesday", "friday",
    ]);
    expect(rows[0].sign_off_date).toBe("2026-11-16");
    expect(rows[5].sign_off_date).toBe("2026-11-27");
    expect(rows.every((r) => r.status === "pending")).toBe(true);
    expect(rows[3].week_number).toBe(2);
  });

  it("defaults to MWF and a 14-day span when fields are null", () => {
    const rows = buildSignoffRows("ra1", "2026-11-16", {
      days_of_week: null,
      cycle_weeks: null,
    });
    expect(rows).toHaveLength(6);
  });

  it("skipBeforeDate drops earlier rows", () => {
    const rows = buildSignoffRows("ra1", "2026-11-16", {
      days_of_week: ["monday", "wednesday", "friday"],
      cycle_weeks: 2,
    }, "2026-11-20");
    expect(rows.map((r) => r.sign_off_date)).toEqual([
      "2026-11-20", "2026-11-23", "2026-11-25", "2026-11-27",
    ]);
  });

  it("respects cycleEndDate over computed span", () => {
    const rows = buildSignoffRows(
      "ra1",
      "2026-11-16",
      { days_of_week: ["monday", "wednesday", "friday"], cycle_weeks: null },
      undefined,
      "2026-11-18"
    );
    expect(rows.map((r) => r.sign_off_date)).toEqual(["2026-11-16", "2026-11-18"]);
  });

  it("daily chores produce one row per day", () => {
    const rows = buildSignoffRows("ra1", "2026-11-16", {
      days_of_week: ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"],
      cycle_weeks: 1,
    });
    expect(rows).toHaveLength(7);
  });
});
