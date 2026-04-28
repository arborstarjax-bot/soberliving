import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getWorkspace,
  getWorkspaceSettings,
  getWorkspacePaymentConfig,
  getWorkspaceMembers,
} from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GeneralSection } from "./general-section";
import { OnboardingSection } from "./onboarding-section";
import { PaymentConfigSection } from "./payment-config-section";
import { CurfewSection } from "./curfew-section";
import { MembersSection } from "./members-section";

export default async function WorkspaceSettingsPage() {
  const user = await requireRole("admin");

  if (!user.workspace_id) {
    redirect("/admin");
  }

  const [workspace, settings, paymentConfig, members, pendingMembers] =
    await Promise.all([
      getWorkspace(user.workspace_id),
      getWorkspaceSettings(user.workspace_id),
      getWorkspacePaymentConfig(user.workspace_id),
      getWorkspaceMembers(user.workspace_id, "active"),
      getWorkspaceMembers(user.workspace_id, "pending"),
    ]);

  if (!workspace) redirect("/admin");

  // Fetch houses for curfew config
  const admin = createAdminClient();
  const { data: houses } = await admin
    .from("houses")
    .select("id, name")
    .eq("workspace_id", user.workspace_id)
    .eq("is_active", true)
    .order("name");

  // Fetch curfews for all houses
  const houseIds = (houses ?? []).map((h: { id: string }) => h.id);
  const { data: allCurfews } = houseIds.length > 0
    ? await admin
        .from("house_curfews")
        .select("*")
        .in("house_id", houseIds)
    : { data: [] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Workspace Settings</h1>
        <p className="text-muted-foreground">
          Manage your workspace configuration
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="curfews">Curfews</TabsTrigger>
          <TabsTrigger value="members">
            Members
            {pendingMembers.length > 0 && (
              <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-xs font-medium text-orange-700">
                {pendingMembers.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralSection workspace={workspace} />
        </TabsContent>

        <TabsContent value="onboarding">
          <OnboardingSection
            workspaceId={workspace.id}
            settings={settings}
          />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentConfigSection
            workspaceId={workspace.id}
            config={paymentConfig}
          />
        </TabsContent>

        <TabsContent value="curfews">
          <CurfewSection
            houses={houses ?? []}
            curfews={allCurfews ?? []}
          />
        </TabsContent>

        <TabsContent value="members">
          <MembersSection
            members={members}
            pendingMembers={pendingMembers}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
