import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";
import type {
  Workspace,
  WorkspaceSettings,
  WorkspacePaymentConfig,
  HouseCurfew,
  WorkspaceInvite,
  WorkspaceMember,
} from "@/lib/types";

export const getWorkspaceForUser = cache(
  async (userId: string): Promise<{ workspace_id: string; role: string } | null> => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    return data;
  }
);

export const getWorkspace = cache(
  async (workspaceId: string): Promise<Workspace | null> => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .single();
    return data as Workspace | null;
  }
);

export const getWorkspaceSettings = cache(
  async (workspaceId: string): Promise<WorkspaceSettings | null> => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("workspace_settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    return data as WorkspaceSettings | null;
  }
);

export const getWorkspacePaymentConfig = cache(
  async (workspaceId: string): Promise<WorkspacePaymentConfig | null> => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("workspace_payment_config")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    return data as WorkspacePaymentConfig | null;
  }
);

export async function getHouseCurfews(
  houseId: string
): Promise<HouseCurfew[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("house_curfews")
    .select("*")
    .eq("house_id", houseId)
    .order("day_of_week");
  return (data ?? []) as HouseCurfew[];
}

/**
 * Returns the effective curfews for a house: its own curfews if any,
 * otherwise falls back to workspace-level defaults (curfews from any
 * other house in the same workspace).
 */
export async function getEffectiveHouseCurfews(
  houseId: string
): Promise<HouseCurfew[]> {
  const own = await getHouseCurfews(houseId);
  if (own.length > 0) return own;

  // Fall back to workspace defaults: find the workspace, then look for
  // curfews from any sibling house.
  const admin = createAdminClient();
  const { data: house } = await admin
    .from("houses")
    .select("workspace_id")
    .eq("id", houseId)
    .single();

  if (!house?.workspace_id) return [];

  // Get all sibling house IDs in the workspace.
  const { data: siblings } = await admin
    .from("houses")
    .select("id")
    .eq("workspace_id", house.workspace_id)
    .neq("id", houseId);

  if (!siblings || siblings.length === 0) return [];

  // Find the first sibling that has curfews configured.
  for (const sib of siblings) {
    const sibCurfews = await getHouseCurfews(sib.id);
    if (sibCurfews.length > 0) {
      // Return sibling curfews but with the original house_id so
      // callers don't need to know about the fallback.
      return sibCurfews.map((c) => ({ ...c, house_id: houseId }));
    }
  }

  return [];
}

export async function getWorkspaceInvites(
  workspaceId: string
): Promise<WorkspaceInvite[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workspace_invites")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  return (data ?? []) as WorkspaceInvite[];
}

export async function getWorkspaceMembers(
  workspaceId: string,
  status: "active" | "pending" | "denied" = "active"
): Promise<(WorkspaceMember & { user: { email: string; full_name: string } })[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workspace_members")
    .select("*, user:users(email, full_name)")
    .eq("workspace_id", workspaceId)
    .eq("status", status)
    .order("joined_at");
  return (data ?? []) as (WorkspaceMember & { user: { email: string; full_name: string } })[];
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}
