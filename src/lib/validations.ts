import { z } from "zod";

// --- Houses ---

export const createHouseSchema = z.object({
  name: z.string().min(1, "House name is required").max(100),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
});

export const updateHouseSchema = z.object({
  name: z.string().min(1, "House name is required").max(100).optional(),
  address: z.string().max(500).nullish(),
  phone: z.string().max(20).nullish(),
});

// --- Rooms ---

export const createRoomSchema = z.object({
  house_id: z.string().uuid(),
  name: z.string().min(1, "Room name is required").max(100),
  floor: z.coerce.number().int().optional(),
  bed_count: z.coerce.number().int().min(0).max(20).optional(),
});

export const updateRoomSchema = z.object({
  name: z.string().min(1, "Room name is required").max(100).optional(),
  floor: z.coerce.number().int().optional(),
});

// --- Beds ---

export const createBedSchema = z.object({
  room_id: z.string().uuid(),
  label: z.string().min(1, "Bed label is required").max(50),
});

export const updateBedSchema = z.object({
  label: z.string().min(1, "Bed label is required").max(50),
});

// --- Residents ---

export const createResidentSchema = z.object({
  house_id: z.string().uuid("House is required"),
  full_name: z.string().min(1, "Full name is required").max(200),
  date_of_birth: z.string().optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  emergency_contact_name: z.string().min(1, "Emergency contact name is required"),
  emergency_contact_phone: z.string().min(1, "Emergency contact phone is required"),
  emergency_contact_relationship: z.string().optional(),
  sobriety_date: z.string().optional(),
  move_in_date: z.string().min(1, "Move-in date is required"),
  notes: z.string().optional(),
});

export const updateResidentSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  date_of_birth: z.string().nullish(),
  phone: z.string().max(20).nullish(),
  email: z.string().email("Invalid email").nullish().or(z.literal("")),
  emergency_contact_name: z.string().nullish(),
  emergency_contact_phone: z.string().nullish(),
  emergency_contact_relationship: z.string().nullish(),
  sobriety_date: z.string().nullish(),
  move_in_date: z.string().optional(),
  move_out_date: z.string().nullish(),
  notes: z.string().nullish(),
});

// --- Bed Assignments ---

export const createBedAssignmentSchema = z.object({
  resident_id: z.string().uuid(),
  bed_id: z.string().uuid(),
});

// --- Chores ---

const dayOfWeekEnum = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export type DayOfWeek = z.infer<typeof dayOfWeekEnum>;

export const ALL_DAYS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export const createChoreSchema = z.object({
  house_id: z.string().uuid(),
  name: z.string().min(1, "Chore name is required").max(200),
  days_of_week: z.array(dayOfWeekEnum).min(1, "Select at least one day"),
  cycle_weeks: z.coerce.number().int().min(1).max(4),
});

export const updateChoreSchema = z.object({
  name: z.string().min(1, "Chore name is required").max(200),
});

export const createChoreTaskSchema = z.object({
  chore_id: z.string().uuid(),
  description: z.string().min(1, "Task description is required").max(500),
});

export const createRotationSchema = z.object({
  house_id: z.string().uuid(),
  cycle_start_date: z.string().min(1, "Start date is required"),
});

export const assignRotationChoreSchema = z.object({
  rotation_id: z.string().uuid(),
  chore_id: z.string().uuid(),
  resident_id: z.string().uuid(),
});

// --- Incidents ---

export const createIncidentSchema = z.object({
  resident_id: z.string().uuid(),
  house_id: z.string().uuid(),
  severity: z.enum(["minor", "major", "critical"]),
  category: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  occurred_at: z.string().min(1, "Date is required"),
});

// --- Leave Requests ---

export const createLeaveRequestSchema = z.object({
  resident_id: z.string().uuid(),
  departure_date: z.string().min(1, "Departure date is required"),
  expected_return_date: z.string().min(1, "Expected return date is required"),
  reason: z.string().optional(),
});

// --- Notes ---

export const createNoteSchema = z.object({
  resident_id: z.string().uuid(),
  content: z.string().min(1, "Note content is required"),
});

// --- Users ---

export const createUserSchema = z.object({
  email: z.string().email("Valid email is required"),
  full_name: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
});

export const updateUserProfileSchema = z.object({
  full_name: z.string().min(1, "Full name is required").max(200).optional(),
  phone: z.string().max(20).nullish(),
  role: z.enum(["admin", "manager", "resident"]).optional(),
  is_resident: z.boolean().optional(),
});

export const assignManagerSchema = z.object({
  user_id: z.string().uuid(),
  house_ids: z.array(z.string().uuid()),
});

// --- Payments ---

export const createPaymentSchema = z.object({
  resident_id: z.string().uuid("Resident is required"),
  house_id: z.string().uuid("House is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  payment_type: z.enum(["rent", "deposit", "fee", "other"]),
  payment_method: z.enum(["cash", "check", "money_order", "venmo", "zelle", "other"]).optional(),
  // status is always "completed" on insert now — no more "pending"
  // state since there's no late-fee / auto-reconciliation workflow.
  // Admins can void a completed payment from the list row.
  charge_id: z.string().uuid().optional(),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
  due_date: z.string().optional(),
  paid_at: z.string().optional(),
  note: z.string().optional(),
});

export const voidPaymentSchema = z.object({
  payment_id: z.string().uuid(),
  reason: z.string().trim().min(1, "Reason is required when voiding a payment"),
});

export const deletePaymentSchema = z.object({
  payment_id: z.string().uuid(),
});

// --- Rent Config ---

export const upsertRentConfigSchema = z.object({
  house_id: z.string().uuid(),
  monthly_amount: z.coerce.number().positive("Monthly amount must be greater than 0"),
  due_day_of_month: z.coerce.number().int().min(1).max(28, "Due day must be between 1 and 28"),
});

// --- Demerits ---

export const createDemeritSchema = z.object({
  resident_id: z.string().uuid("Resident is required"),
  house_id: z.string().uuid("House is required"),
  points: z.coerce.number().int().min(1).max(10).default(1),
  reason: z.string().min(1, "Reason is required"),
  category: z.string().optional(),
});

// --- Warnings (no points; documentation + notification only) ---

export const createWarningSchema = z.object({
  resident_id: z.string().uuid("Resident is required"),
  house_id: z.string().uuid("House is required"),
  reason: z.string().min(1, "Reason is required"),
  category: z.string().optional(),
});

export const resolveDemeritSchema = z.object({
  demerit_id: z.string().uuid(),
  resolution_note: z.string().optional(),
});
