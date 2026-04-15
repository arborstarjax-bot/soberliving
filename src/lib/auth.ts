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

  // Use SECURITY DEFINER RPC to bypass RLS for auth lookups
  const { data: sessionData } = await supabase.rpc("get_session_user", {
    p_user_id: user.id,
  });

  if (!sessionData) return null;

  const profile = sessionData as {
    id: string;
    email: string;
    full_name: string;
    role: string;
  };

  const role: UserRole = (
    ["admin", "manager", "resident"].includes(profile.role)
      ? profile.role
      : "resident"
  ) as UserRole;

  let assignedHouseIds: string[] = [];
  if (role === "manager") {
    const { data: assignments } = await supabase
      .from("manager_house_assignments")
      .select("house_id")
      .eq("user_id", user.id)
      .is("unassigned_at", null);
    assignedHouseIds = assignments?.map((a) => a.house_id) ?? [];
  }

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role,
    assigned_house_ids: assignedHouseIds,
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
