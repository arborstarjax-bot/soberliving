// Shared mapping of activity_log.event_type → user-facing category.
// Both the server page (to filter queries by category) and the client
// tabs strip consume this, so keep it in a plain TS file with no React
// imports.
//
// Keys here must stay in sync with the event_type values that server
// actions call logActivity() with. When a new event_type is added,
// extend this map or it will silently fall into "Other".

export const ACTIVITY_EVENT_TO_CATEGORY: Record<string, string> = {
  // Residents
  move_in: "Residents",
  move_out: "Residents",
  bed_assigned: "Residents",
  bed_vacated: "Residents",
  user_created: "Residents",
  role_changed: "Residents",
  resident_deleted: "Residents",
  resident_discharged: "Residents",

  // Chores
  chore_created: "Chores",
  chore_assigned: "Chores",
  chore_completed: "Chores",
  chore_approved: "Chores",
  chore_rejected: "Chores",
  chore_overridden: "Chores",
  chore_signoff_overridden: "Chores",
  chore_unassigned: "Chores",
  chore_rotated: "Chores",
  rotation_created: "Chores",
  rotation_shuffled: "Chores",

  // Incidents
  incident_logged: "Incidents",

  // Discipline
  demerit_issued: "Discipline",
  demerit_edited: "Discipline",
  demerit_deleted: "Discipline",
  demerit_worked_off: "Discipline",
  demerit_resolved: "Discipline",
  warning_issued: "Discipline",
  warning_edited: "Discipline",
  warning_deleted: "Discipline",
  restriction_added: "Discipline",
  restriction_created: "Discipline",
  restriction_lifted: "Discipline",
  restriction_deleted: "Discipline",

  // Leave
  leave_requested: "Leave",
  leave_approved: "Leave",
  leave_denied: "Leave",
  leave_returned: "Leave",
  resident_signed_out: "Leave",
  resident_signed_in: "Leave",

  // Notes
  note_added: "Notes",

  // Intake
  intake_review_completed: "Intake",
  intake_marked_complete: "Intake",

  // Check-Ins
  check_in_sent: "Check-Ins",
  check_in_submitted: "Check-Ins",
  check_in_completed: "Check-Ins",

  // Houses
  house_created: "Houses",
  house_updated: "Houses",
  house_deleted: "Houses",
  house_archived: "Houses",
  room_created: "Houses",
  room_updated: "Houses",
  room_deleted: "Houses",
  bed_created: "Houses",
  bed_updated: "Houses",
  bed_deleted: "Houses",
};

// The canonical order of category tabs shown in the UI.
export const ACTIVITY_CATEGORIES = [
  "All",
  "Residents",
  "Chores",
  "Check-Ins",
  "Discipline",
  "Incidents",
  "Leave",
  "Notes",
  "Intake",
  "Houses",
  "Other",
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

// Return the list of event_types that belong to a given category. Used
// by server-side pagination to build `.in("event_type", [...])` filters.
// Returns an empty array for "All" (caller should skip the .in filter).
// Returns an empty array for "Other" — the page code treats that as
// "not in the mapped set" via a NOT IN filter instead.
export function eventTypesForCategory(category: string): string[] {
  if (category === "All") return [];
  if (category === "Other") return [];
  return Object.entries(ACTIVITY_EVENT_TO_CATEGORY)
    .filter(([, cat]) => cat === category)
    .map(([evt]) => evt);
}

// Full set of mapped event_types. Used to implement "Other" as "event_type
// NOT IN mapped_set".
export function allMappedEventTypes(): string[] {
  return Object.keys(ACTIVITY_EVENT_TO_CATEGORY);
}
