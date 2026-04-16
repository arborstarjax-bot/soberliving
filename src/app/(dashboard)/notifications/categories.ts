// Shared mapping of notification `type` → user-facing category.
// Used by both the server page (to filter queries per tab) and the
// client list (to pick the row icon).

export const NOTIFICATION_TYPE_TO_CATEGORY: Record<string, string> = {
  cover_request: "Leave",
  manager_approval: "Leave",
  admin_approval: "Leave",
  leave_approved: "Leave",
  leave_rejected: "Leave",
  leave_returned: "Leave",
  chore_reminder: "Chores",
  chore_assigned: "Chores",
  chore_completed: "Chores",
  chore_approved: "Chores",
  chore_rejected: "Chores",
  missed_chore: "Discipline",
  demerit_issued: "Discipline",
  demerit_worked_off: "Discipline",
  restriction_created: "Discipline",
  restriction_lifted: "Discipline",
  incident_logged: "Incidents",
  check_in_sent: "Check-Ins",
  check_in_submitted: "Check-Ins",
  bulletin_post: "Bulletin",
  bulletin_comment: "Bulletin",
  bulletin_like: "Bulletin",
  bed_assigned: "Housing",
  bed_changed: "Housing",
  discharge: "Housing",
};

export const NOTIFICATION_CATEGORIES = [
  "All",
  "Leave",
  "Chores",
  "Discipline",
  "Incidents",
  "Check-Ins",
  "Bulletin",
  "Housing",
  "Other",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export function notificationTypesForCategory(category: string): string[] {
  if (category === "All" || category === "Other") return [];
  return Object.entries(NOTIFICATION_TYPE_TO_CATEGORY)
    .filter(([, cat]) => cat === category)
    .map(([type]) => type);
}

export function allMappedNotificationTypes(): string[] {
  return Object.keys(NOTIFICATION_TYPE_TO_CATEGORY);
}
