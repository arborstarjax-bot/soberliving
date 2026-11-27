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
  leave_requested: "Leave",
  resident_signed_out: "Leave",
  resident_signed_in: "Leave",
  chore_reminder: "Chores",
  chore_assigned: "Chores",
  chore_completed: "Chores",
  chore_submitted: "Chores",
  chore_approved: "Chores",
  chore_rejected: "Chores",
  missed_chore: "Discipline",
  demerit_issued: "Discipline",
  demerit_worked_off: "Discipline",
  warning_issued: "Discipline",
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
  intake_submitted: "Housing",
  intake_approved: "Housing",
  intake_reopened: "Housing",
  commitment_signed: "Housing",
  commitment_amendment: "Payments",
  payment_recorded: "Payments",
};

export const NOTIFICATION_CATEGORIES = [
  "All",
  "Needs Attention",
  "Leave",
  "Chores",
  "Discipline",
  "Incidents",
  "Check-Ins",
  "Bulletin",
  "Housing",
  "Payments",
  "Other",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

// Notification types that represent something the recipient still has
// to act on. Powers the "Needs Attention" tab: staff see pending
// chore signoffs / leave approvals / intake reviews, residents see
// pending signature requests (commitment amendments, etc). We filter
// further by entity status on the server so resolved rows don't show
// up in the tab even if the notification itself lingers.
export const NEEDS_ATTENTION_NOTIFICATION_TYPES = [
  "chore_submitted",
  "manager_approval",
  "admin_approval",
  "cover_request",
  "intake_submitted",
  "commitment_amendment",
] as const;

export function notificationTypesForCategory(category: string): string[] {
  if (category === "All" || category === "Other") return [];
  if (category === "Needs Attention") {
    return [...NEEDS_ATTENTION_NOTIFICATION_TYPES];
  }
  return Object.entries(NOTIFICATION_TYPE_TO_CATEGORY)
    .filter(([, cat]) => cat === category)
    .map(([type]) => type);
}

export function allMappedNotificationTypes(): string[] {
  return Object.keys(NOTIFICATION_TYPE_TO_CATEGORY);
}
