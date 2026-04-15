// ============================================================
// Core application types for the Sober Living Management App
// ============================================================

// --- Enums ---

export type UserRole = "admin" | "manager" | "resident";

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

export type PaymentType = "rent" | "deposit" | "fee" | "other";

export type PaymentMethod = "cash" | "check" | "money_order" | "venmo" | "zelle" | "other";

export type PaymentStatus = "completed" | "pending" | "refunded" | "void";

export type DemeritStatus = "active" | "resolved" | "appealed";

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

export interface RentConfig {
  id: string;
  house_id: string;
  monthly_amount: number;
  due_day_of_month: number;
  late_fee: number;
  grace_period_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  resident_id: string;
  house_id: string;
  amount: number;
  payment_type: PaymentType;
  payment_method: PaymentMethod | null;
  status: PaymentStatus;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  paid_at: string;
  note: string | null;
  recorded_by: string;
  created_at: string;
  updated_at: string;
}

export interface Demerit {
  id: string;
  resident_id: string;
  house_id: string;
  issued_by: string;
  points: number;
  reason: string;
  category: string | null;
  status: DemeritStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
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

export interface PaymentWithDetails extends Payment {
  resident: { full_name: string };
  house: { name: string };
  recorder: { full_name: string };
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
  assigned_house_ids: string[];
}
