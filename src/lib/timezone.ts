/**
 * Timezone utilities for house-scoped date calculations.
 *
 * All chore due-date, missed-chore, and restriction-expiry logic
 * should use these helpers instead of raw `new Date()` / `toISOString()`.
 *
 * These functions are safe to use in both server and client components.
 */

/**
 * Default IANA timezone used when a house has no timezone set.
 *
 * The app is operated out of the US East coast, so every time we render,
 * log, or compute a date without a house-specific override we pin it to
 * Eastern time. "America/New_York" handles EST/EDT DST automatically.
 */
export const DEFAULT_TIMEZONE = "America/New_York";

/**
 * App-wide timezone constant. Client components (which can't read the
 * house row) should pass this to `toLocaleDateString` / `toLocaleString`
 * so rendered times don't drift to the viewer's browser timezone.
 */
export const APP_TIMEZONE = DEFAULT_TIMEZONE;

/**
 * Formats a Date or ISO timestamp in the app's Eastern timezone.
 * Pass Intl.DateTimeFormatOptions to customize; `timeZone` is always
 * forced to APP_TIMEZONE and cannot be overridden.
 */
export function formatInAppTz(
  value: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  }
): string {
  if (value === null || value === undefined) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { ...options, timeZone: APP_TIMEZONE });
}

/**
 * Formats a date-only value (PostgreSQL `date` columns come back as
 * "YYYY-MM-DD") for display. Date-only strings have no timezone — they
 * represent a calendar day, not an instant. `new Date("2026-04-18")`
 * parses as UTC midnight, which when rendered in Eastern becomes 8 PM
 * the previous day, so dates like `move_in_date`, `sobriety_date`,
 * `due_date`, etc. would silently display one day earlier if they went
 * through `formatInAppTz` or a raw `toLocaleDateString("en-US",
 * { timeZone: "America/New_York" })`.
 *
 * This helper parses the date-only components out of the string (or
 * uses `Date.UTC` for a proper Date) and formats them in UTC so the
 * rendered day is exactly the stored day, regardless of server or
 * browser timezone.
 *
 * Accepts either a "YYYY-MM-DD" string (optionally with a time suffix,
 * in which case only the date portion is used) or a Date object whose
 * UTC year/month/day components represent the intended calendar day.
 */
export function formatDateOnly(
  value: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  }
): string {
  if (value === null || value === undefined) return "";
  let y: number;
  let m: number;
  let d: number;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    y = value.getUTCFullYear();
    m = value.getUTCMonth() + 1;
    d = value.getUTCDate();
  } else {
    if (typeof value !== "string" || value.length < 10) return "";
    const [ys, ms, ds] = value.slice(0, 10).split("-").map(Number);
    if (!ys || !ms || !ds) return "";
    y = ys;
    m = ms;
    d = ds;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

/**
 * Returns today's date string (YYYY-MM-DD) in the given IANA timezone.
 */
export function getHouseToday(timezone: string = DEFAULT_TIMEZONE): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA locale formats as YYYY-MM-DD
  return formatter.format(now);
}

/**
 * Returns yesterday's date string (YYYY-MM-DD) in the given IANA timezone.
 */
export function getHouseYesterday(timezone: string = DEFAULT_TIMEZONE): string {
  // First get today's date in the target timezone, then subtract 1 day.
  // This avoids the bug where setDate() on a UTC Date gives wrong results
  // for timezones ahead of UTC.
  const todayStr = getHouseToday(timezone);
  const todayDate = new Date(todayStr + "T12:00:00"); // noon to avoid DST edge
  todayDate.setDate(todayDate.getDate() - 1);
  const yyyy = todayDate.getFullYear();
  const mm = String(todayDate.getMonth() + 1).padStart(2, "0");
  const dd = String(todayDate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns the calendar date (YYYY-MM-DD) of an ISO timestamp in the given
 * IANA timezone. Useful for comparing a row's `created_at` to a stored
 * date-only column like `sign_off_date` without tripping over UTC offsets.
 */
export function isoDateInTz(
  iso: string,
  timezone: string = DEFAULT_TIMEZONE
): string {
  const d = new Date(iso);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

/**
 * Returns today's day-of-week name (e.g. "monday") in the given timezone.
 */
export function getHouseDayOfWeek(
  timezone: string = DEFAULT_TIMEZONE
): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  });
  return formatter.format(now).toLowerCase();
}

/**
 * Returns the UTC ISO timestamp corresponding to 00:00:00 local-time on the
 * given YYYY-MM-DD date in the given IANA timezone.
 *
 * Example: startOfDayInTz("2026-04-16", "America/Los_Angeles") returns
 * "2026-04-16T07:00:00.000Z" (PDT = UTC-7).
 *
 * This is the helper State of the House uses so "Today"/"This Month"
 * ranges line up with the house's calendar rather than the server's UTC
 * day, which would otherwise drift by several hours.
 */
export function startOfDayInTz(dateStr: string, timezone: string): string {
  // Start from UTC midnight of the target date, then figure out how that
  // instant renders in the target timezone. The gap between the rendered
  // wall-clock time and the intended local midnight is the timezone
  // offset we need to subtract from UTC midnight.
  const utcMidnight = new Date(`${dateStr}T00:00:00Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(utcMidnight);
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  const renderedAsUTC = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second
  );
  const offsetMs = renderedAsUTC - utcMidnight.getTime();
  return new Date(utcMidnight.getTime() - offsetMs).toISOString();
}

/**
 * Returns the UTC ISO timestamp corresponding to 23:59:59.999 local-time
 * on the given YYYY-MM-DD date in the given IANA timezone. Used for the
 * inclusive end of a custom date range.
 */
export function endOfDayInTz(dateStr: string, timezone: string): string {
  // End-of-day is 1ms before the start of the *next calendar day* in the
  // same timezone. Computing that via `start + 24h` is wrong on DST
  // transition days (a spring-forward day is 23h long, fall-back is 25h),
  // so we bump the Y/M/D explicitly and re-call startOfDayInTz so DST is
  // resolved per-day.
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextStr = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  const nextStart = new Date(startOfDayInTz(nextStr, timezone));
  return new Date(nextStart.getTime() - 1).toISOString();
}

/**
 * Returns the first day of the current month (YYYY-MM-01) in the given
 * IANA timezone. Used by State of the House to compute the "This month
 * to date" range anchor.
 */
export function getHouseFirstOfMonth(
  timezone: string = DEFAULT_TIMEZONE
): string {
  const today = getHouseToday(timezone); // "YYYY-MM-DD"
  return `${today.slice(0, 7)}-01`;
}
