import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getWorkspaceSettings } from "@/lib/workspace";
import { QuickSignupForm } from "./quick-signup-form";

export default async function QuickSignupPage() {
  const user = await requireAuth();

  // If workspace requires full application, redirect to intake
  if (user.workspace_id) {
    const wsSettings = await getWorkspaceSettings(user.workspace_id);
    if (wsSettings?.require_application) {
      redirect("/intake");
    }
  }

  return <QuickSignupForm />;
}
