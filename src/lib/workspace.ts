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
  workspaceId: string
): Promise<(WorkspaceMember & { user: { email: string; full_name: string } })[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workspace_members")
    .select("*, user:users(email, full_name)")
    .eq("workspace_id", workspaceId)
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
