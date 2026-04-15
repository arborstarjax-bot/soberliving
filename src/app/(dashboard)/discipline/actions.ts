"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { sendNotification } from "@/lib/notifications";
import { z } from "zod";

const createDemeritSchema = z.object({
  resident_id: z.string().uuid(),
  house_id: z.string().uuid(),
  reason: z.string().min(1, "Reason is required"),
  notes: z.string().optional(),
});

export async function createDemerit(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const parsed = createDemeritSchema.safeParse({
    resident_id: formData.get("resident_id"),
    house_id: formData.get("house_id"),
    reason: formData.get("reason"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (user.role !== "admin" && !canAccessHouse(user, parsed.data.house_id)) {
    return { error: "Not authorized for this house" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("demerits")
    .insert({
      resident_id: parsed.data.resident_id,
      house_id: parsed.data.house_id,
      reason: parsed.data.reason,
      notes: parsed.data.notes ?? null,
      status: "active",
      issued_by: user.id,
      auto_generated: false,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const { data: resident } = await supabase
    .from("residents")
    .select("full_name, user_id")
    .eq("id", parsed.data.resident_id)
    .single();

  await logActivity({
    houseId: parsed.data.house_id,
    residentId: parsed.data.resident_id,
    actorId: user.id,
    eventType: "demerit_issued",
    entityType: "demerit",
    entityId: data.id,
    description: `Demerit issued to ${resident?.full_name}: ${parsed.data.reason}`,
  });

  if (resident?.user_id) {
    await sendNotification({
      userId: resident.user_id,
      type: "demerit_issued",
      title: "Demerit Issued",
      message: `You received a demerit: ${parsed.data.reason}`,
      actionUrl: "/discipline",
      entityType: "demerit",
      entityId: data.id,
    });
  }

  revalidatePath("/discipline");
  return {};
}

export async function editDemerit(
  demeritId: string,
  reason: string,
  notes?: string
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: demerit } = await supabase
    .from("demerits")
    .select("house_id, resident_id")
    .eq("id", demeritId)
    .single();

  if (!demerit) return { error: "Demerit not found" };
  if (user.role !== "admin" && !canAccessHouse(user, demerit.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("demerits")
    .update({
      reason,
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", demeritId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: demerit.house_id,
    residentId: demerit.resident_id,
    actorId: user.id,
    eventType: "demerit_edited",
    entityType: "demerit",
    entityId: demeritId,
    description: `Demerit edited by ${user.full_name}: ${reason}`,
  });

  revalidatePath("/discipline");
  return {};
}

export async function deleteDemerit(demeritId: string) {
  const user = await requireAuth();
  if (user.role !== "admin") return { error: "Only admins can delete demerits" };

  const supabase = await createClient();

  const { data: demerit } = await supabase
    .from("demerits")
    .select("house_id, resident_id, reason")
    .eq("id", demeritId)
    .single();

  if (!demerit) return { error: "Demerit not found" };

  const { error } = await supabase
    .from("demerits")
    .delete()
    .eq("id", demeritId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: demerit.house_id,
    residentId: demerit.resident_id,
    actorId: user.id,
    eventType: "demerit_deleted",
    entityType: "demerit",
    entityId: demeritId,
    description: `Demerit deleted by ${user.full_name}: ${demerit.reason}`,
  });

  revalidatePath("/discipline");
  return {};
}

export async function markDemeritWorkedOff(demeritId: string, note?: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: demerit } = await supabase
    .from("demerits")
    .select("house_id, resident_id, reason")
    .eq("id", demeritId)
    .single();

  if (!demerit) return { error: "Demerit not found" };
  if (user.role !== "admin" && !canAccessHouse(user, demerit.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("demerits")
    .update({
      status: "worked_off",
      worked_off_by: user.id,
      worked_off_at: new Date().toISOString(),
      worked_off_note: note ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", demeritId);

  if (error) return { error: error.message };

  const { data: resident } = await supabase
    .from("residents")
    .select("full_name, user_id")
    .eq("id", demerit.resident_id)
    .single();

  await logActivity({
    houseId: demerit.house_id,
    residentId: demerit.resident_id,
    actorId: user.id,
    eventType: "demerit_worked_off",
    entityType: "demerit",
    entityId: demeritId,
    description: `Demerit marked as worked off for ${resident?.full_name}: ${demerit.reason}`,
  });

  if (resident?.user_id) {
    await sendNotification({
      userId: resident.user_id,
      type: "demerit_worked_off",
      title: "Demerit Worked Off",
      message: `Your demerit has been marked as worked off: ${demerit.reason}`,
      actionUrl: "/discipline",
      entityType: "demerit",
      entityId: demeritId,
    });
  }

  revalidatePath("/discipline");
  return {};
}

// --- Auto-demerit for missed chores ---

export async function generateMissedChoreDemerits() {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const adminClient = createAdminClient();

  // Yesterday's date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayOfWeek = dayNames[yesterday.getDay()];

  // Get all chores scheduled for yesterday's day-of-week
  const { data: chores } = await adminClient
    .from("chores")
    .select("id, name, house_id, scheduled_days, assigned_resident_id")
    .eq("is_active", true)
    .not("assigned_resident_id", "is", null)
    .contains("scheduled_days", [dayOfWeek]);

  if (!chores || chores.length === 0) return { count: 0 };

  let demeritCount = 0;

  for (const chore of chores) {
    // Check if this chore was completed yesterday
    const { data: completion } = await adminClient
      .from("chore_completions")
      .select("id")
      .eq("chore_id", chore.id)
      .eq("resident_id", chore.assigned_resident_id)
      .eq("completion_date", yesterdayStr)
      .single();

    if (completion) continue; // Completed, skip

    // Check if demerit already exists for this chore+date
    const { data: existingDemerit } = await adminClient
      .from("demerits")
      .select("id")
      .eq("source_chore_id", chore.id)
      .eq("source_date", yesterdayStr)
      .eq("resident_id", chore.assigned_resident_id)
      .single();

    if (existingDemerit) continue; // Already issued

    // Create auto-demerit
    const { data: demerit } = await adminClient
      .from("demerits")
      .insert({
        resident_id: chore.assigned_resident_id,
        house_id: chore.house_id,
        reason: `Missed chore: ${chore.name} on ${yesterdayStr}`,
        status: "active",
        issued_by: user.id,
        auto_generated: true,
        source_chore_id: chore.id,
        source_date: yesterdayStr,
      })
      .select("id")
      .single();

    if (demerit) {
      demeritCount++;

      // Notify resident
      const { data: resident } = await adminClient
        .from("residents")
        .select("user_id, full_name")
        .eq("id", chore.assigned_resident_id)
        .single();

      if (resident?.user_id) {
        await sendNotification({
          userId: resident.user_id,
          type: "missed_chore",
          title: "Missed Chore Demerit",
          message: `You received a demerit for missing "${chore.name}" on ${yesterdayStr}`,
          actionUrl: "/discipline",
          entityType: "demerit",
          entityId: demerit.id,
        });
      }

      await logActivity({
        houseId: chore.house_id,
        residentId: chore.assigned_resident_id,
        actorId: user.id,
        eventType: "demerit_auto_issued",
        entityType: "demerit",
        entityId: demerit.id,
        description: `Auto-demerit for missed chore "${chore.name}" on ${yesterdayStr} for ${resident?.full_name}`,
      });
    }
  }

  revalidatePath("/discipline");
  return { count: demeritCount };
}
