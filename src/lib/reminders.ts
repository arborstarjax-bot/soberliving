/** Workspace reminder toggles — each notification family can be
 * turned off per workspace, and timed "day_of" or "day_before". */
export const REMINDER_TYPES = [
  { slug: "chore", label: "Chore reminders" },
  { slug: "rent", label: "Rent reminders" },
  { slug: "curfew", label: "Curfew reminders" },
] as const;

export type ReminderType = (typeof REMINDER_TYPES)[number]["slug"];

type ReminderSettings =
  | { reminder_settings?: Record<string, { enabled?: boolean; timing?: string }> | null }
  | null
  | undefined;

/** Missing settings row or missing key → reminders stay on. */
export function isReminderEnabled(
  settings: ReminderSettings,
  type: ReminderType
): boolean {
  return settings?.reminder_settings?.[type]?.enabled !== false;
}

export function reminderTiming(
  settings: ReminderSettings,
  type: ReminderType
): "day_of" | "day_before" {
  return settings?.reminder_settings?.[type]?.timing === "day_before"
    ? "day_before"
    : "day_of";
}
