/**
 * Timezone utilities for house-scoped date calculations.
 *
 * All chore due-date, missed-chore, and restriction-expiry logic
 * should use these helpers instead of raw `new Date()` / `toISOString()`.
 *
 * These functions are safe to use in both server and client components.
 */

/**
 * Default timezone used when a house has no timezone set.
 */
export const DEFAULT_TIMEZONE = "America/Los_Angeles";

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
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
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
