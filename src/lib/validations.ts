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

export const updateResidentSchema = createResidentSchema.partial().omit({
  house_id: true,
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
  full_name: z.string().min(1, "Full name is required").max(200),
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
  status: z.enum(["completed", "pending"]).default("completed"),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
  due_date: z.string().optional(),
  paid_at: z.string().optional(),
  note: z.string().optional(),
});

export const voidPaymentSchema = z.object({
  payment_id: z.string().uuid(),
});

// --- Rent Config ---

export const upsertRentConfigSchema = z.object({
  house_id: z.string().uuid(),
  monthly_amount: z.coerce.number().positive("Monthly amount must be greater than 0"),
  due_day_of_month: z.coerce.number().int().min(1).max(28, "Due day must be between 1 and 28"),
  late_fee: z.coerce.number().min(0, "Late fee cannot be negative").default(0),
  grace_period_days: z.coerce.number().int().min(0, "Grace period cannot be negative").default(0),
});

// --- Demerits ---

export const createDemeritSchema = z.object({
  resident_id: z.string().uuid("Resident is required"),
  house_id: z.string().uuid("House is required"),
  points: z.coerce.number().int().min(1).max(10).default(1),
  reason: z.string().min(1, "Reason is required"),
  category: z.string().optional(),
});

export const resolveDemeritSchema = z.object({
  demerit_id: z.string().uuid(),
  resolution_note: z.string().optional(),
});
