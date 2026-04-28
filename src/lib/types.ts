// ============================================================
// Core application types for the Sober Living Management App
// ============================================================

// --- Enums ---

export type UserRole = "admin" | "manager" | "resident";

export type WorkspaceRole = "owner" | "admin" | "manager" | "resident";

export type PaymentFrequencyOption = "weekly" | "bi-weekly" | "monthly";

export type PaymentMethod = "cash" | "venmo" | "zelle" | "check" | "money_order" | "other";

// --- Workspace Types ---

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  invited_by: string | null;
  joined_at: string;
}

export interface WorkspaceInvite {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  token: string;
  invited_by: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface WorkspaceSettings {
  id: string;
  workspace_id: string;
  require_application: boolean;
  require_commitment: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkspacePaymentConfig {
  id: string;
  workspace_id: string;
  default_rent_amount: number;
  payment_frequency: PaymentFrequencyOption;
  payment_due_day: string | null;
  accepted_methods: PaymentMethod[];
  late_fee_amount: number;
  grace_period_days: number;
  created_at: string;
  updated_at: string;
}

export interface HouseCurfew {
  id: string;
  house_id: string;
  day_of_week: string;
  curfew_time: string;
}

export type ResidentStatus = "active" | "discharged" | "on_leave";

export type ChoreDay = "monday" | "wednesday" | "friday";

export type ChoreSignoffStatus =
  | "pending"
  | "completed_pending_review"
  | "approved"
  | "rejected"
  | "missed";

export type IncidentSeverity = "minor" | "major" | "critical";

export type LeaveRequestStatus = "pending" | "approved" | "denied" | "returned";

// --- Database Row Types ---

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
}

export interface House {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  capacity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ManagerHouseAssignment {
  id: string;
  user_id: string;
  house_id: string;
  assigned_at: string;
  unassigned_at: string | null;
}

export interface Room {
  id: string;
  house_id: string;
  name: string;
  floor: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Bed {
  id: string;
  room_id: string;
  label: string;
  is_active: boolean;
  created_at: string;
}

export interface Resident {
  id: string;
  user_id: string | null;
  house_id: string;
  full_name: string;
  date_of_birth: string | null;
  phone: string | null;
  email: string | null;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string | null;
  sobriety_date: string | null;
  move_in_date: string;
  move_out_date: string | null;
  status: ResidentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BedAssignment {
  id: string;
  resident_id: string;
  bed_id: string;
  start_date: string;
  end_date: string | null;
  assigned_by: string;
  created_at: string;
}

export interface Chore {
  id: string;
  house_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChoreTask {
  id: string;
  chore_id: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface ChoreRotation {
  id: string;
  house_id: string;
  cycle_start_date: string;
  cycle_end_date: string;
  is_current: boolean;
  created_by: string;
  created_at: string;
}

export interface ChoreRotationAssignment {
  id: string;
  rotation_id: string;
  chore_id: string;
  resident_id: string;
  assigned_by: string;
  created_at: string;
}

export interface ChoreSignoff {
  id: string;
  rotation_assignment_id: string;
  sign_off_date: string;
  day_of_week: ChoreDay;
  week_number: 1 | 2;
  status: ChoreSignoffStatus;
  completed_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Incident {
  id: string;
  resident_id: string;
  house_id: string;
  reported_by: string;
  severity: IncidentSeverity;
  category: string | null;
  description: string;
  occurred_at: string;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  resident_id: string;
  requested_by: string;
  departure_date: string;
  expected_return_date: string;
  actual_return_date: string | null;
  reason: string | null;
  status: LeaveRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  denial_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResidentNote {
  id: string;
  resident_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  house_id: string | null;
  resident_id: string | null;
  actor_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// --- Joined / Extended Types ---

export interface UserWithRole extends User {
  role: UserRole;
}

export interface ResidentWithBeds extends Resident {
  bed_assignments: (BedAssignment & { bed: Bed & { room: Room } })[];
}

export interface ChoreWithTasks extends Chore {
  tasks: ChoreTask[];
}

export interface ChoreRotationAssignmentWithDetails extends ChoreRotationAssignment {
  chore: ChoreWithTasks;
  resident: Resident;
  signoffs: ChoreSignoff[];
}

export interface HouseWithOccupancy extends House {
  rooms: (Room & {
    beds: (Bed & {
      current_assignment: (BedAssignment & { resident: Resident }) | null;
    })[];
  })[];
  occupied_beds: number;
  total_beds: number;
}

// --- Auth Context ---

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  workspace_id: string | null;
  workspace_role: WorkspaceRole | null;
  assigned_house_ids: string[];
  intake_completed: boolean;
  is_resident: boolean;
  commitment_signed: boolean;
  // True when the resident has a house_commitments row with
  // status='pending_resident_signature' — covers both the initial
  // commitment (before they've ever signed) and amendments proposed
  // after they signed. Layouts use this to force residents into
  // /sign-commitment regardless of their commitment_signed flag.
  has_pending_commitment: boolean;
  // ID of the oldest active blocker targeted at this resident that
  // they haven't acknowledged yet, or null. Layouts use this to
  // force residents into /acknowledge/[id] before they can do
  // anything else. FIFO order so multiple pending blockers are
  // resolved oldest-first.
  pending_blocker_id: string | null;
  // True when this user was previously a house resident but their
  // residents row is currently non-active (discharged, moved out,
  // etc.). Layouts use this to hard-gate them onto the /discharged
  // page — login, email, and documents are preserved so they can
  // return later, but they can't navigate the app while discharged.
  resident_discharged: boolean;
  // House IDs that belong to the user's workspace. For admins this is
  // all houses in their workspace (not all houses in the DB). Managers
  // use assigned_house_ids instead. Used by getAccessibleHouseFilter
  // to scope admin queries to their workspace.
  workspace_house_ids: string[];
  // Workspace membership status: "active", "pending", or "denied".
  // Pending users can complete intake but not access the dashboard.
  workspace_member_status: "active" | "pending" | "denied" | null;
}

// --- Blockers ---

export type BlockerTargetType = "all" | "house" | "residents";

export interface Blocker {
  id: string;
  title: string;
  body: string;
  attachment_paths: string[];
  target_type: BlockerTargetType;
  target_house_ids: string[];
  target_user_ids: string[];
  save_to_docs: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface BlockerAcknowledgment {
  blocker_id: string;
  user_id: string;
  acknowledged_at: string;
  signature: string;
  document_id: string | null;
}

// --- Grievances ---

export type GrievanceType = "grievance" | "problem";

export type GrievanceStatus = "open" | "in_progress" | "resolved";

// --- Safety Assessments ---

export interface SafetyAssessment {
  id: string;
  house_id: string;
  // See src/lib/safety-checklist.ts for the shape of the checklist
  // payload — { [sectionKey]: { [itemKey]: boolean } }.
  checklist: Record<string, Record<string, boolean>>;
  person_completing_name: string;
  completed_by: string | null;
  signature: string;
  assessment_date: string;
  notes: string | null;
  document_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Grievance {
  id: string;
  // NULL when anonymous — see supabase/migrations/.._add_grievances.sql
  // for the check constraint that enforces the invariant.
  user_id: string | null;
  house_id: string | null;
  submitted_anonymously: boolean;
  report_type: GrievanceType;
  subject: string;
  description: string;
  attachment_paths: string[];
  status: GrievanceStatus;
  internal_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}
