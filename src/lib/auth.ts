import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SessionUser, UserRole } from "@/lib/types";

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, full_name")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const { data: roleRecord } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const role: UserRole = roleRecord?.role ?? "resident";

  let assignedHouseIds: string[] = [];
  if (role === "manager") {
    const { data: assignments } = await supabase
      .from("manager_house_assignments")
      .select("house_id")
      .eq("user_id", user.id)
      .is("unassigned_at", null);
    assignedHouseIds = assignments?.map((a) => a.house_id) ?? [];
  }

  // Check if the user has a linked resident record for intake/commitment status
  const isResident = role === "resident";
  let intakeCompleted = false;
  let commitmentSigned = false;

  if (isResident) {
    const { data: resident } = await supabase
      .from("residents")
      .select("intake_completed, commitment_signed")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    intakeCompleted = resident?.intake_completed ?? false;
    commitmentSigned = resident?.commitment_signed ?? false;
  }

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role,
    assigned_house_ids: assignedHouseIds,
    intake_completed: intakeCompleted,
    is_resident: isResident,
    commitment_signed: commitmentSigned,
  };
});

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireRole(
  ...roles: UserRole[]
): Promise<SessionUser> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    redirect("/dashboard");
  }
  return user;
}
