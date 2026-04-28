import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getWorkspaceSettings } from "@/lib/workspace";
import { IntakeFormWizard } from "./intake-form-wizard";

export default async function IntakePage() {
  const user = await requireAuth();

  // Already completed — go to dashboard
  if (user.intake_completed) {
    redirect("/dashboard");
  }

  // If workspace doesn't require the full application, use quick signup
  if (user.workspace_id) {
    const wsSettings = await getWorkspaceSettings(user.workspace_id);
    if (wsSettings && !wsSettings.require_application) {
      redirect("/quick-signup");
    }
  }

  // Load any existing draft
  const adminClient = createAdminClient();
  const { data: draft } = await adminClient
    .from("intake_forms")
    .select("form_data, signatures")
    .eq("user_id", user.id)
    .eq("status", "draft")
    .single();

  return (
    <IntakeFormWizard
      userName={user.full_name}
      userEmail={user.email}
      initialData={draft?.form_data as Record<string, string> | null}
      initialSignatures={draft?.signatures as Record<string, string> | null}
    />
  );
}
