import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getWorkspaceSettings } from "@/lib/workspace";
import { redirect } from "next/navigation";
import { ChecklistView } from "./checklist-view";

export default async function IntakeChecklistPage() {
  const user = await requireAuth();
  const ws = user.workspace_id
    ? await getWorkspaceSettings(user.workspace_id)
    : null;
  if (!ws) redirect("/dashboard");

  const rules = (ws.rules_text ?? "")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);

  const admin = createAdminClient();
  const { data: ackDocs } = await admin
    .from("documents")
    .select("id, name, storage_path")
    .eq("workspace_id", user.workspace_id)
    .eq("document_type", "vault")
    .eq("requires_intake_ack", true);

  // Nothing configured → straight to rules
  if (!rules.length && !(ackDocs ?? []).length) {
    redirect("/dashboard");
  }

  return (
    <ChecklistView
      rules={ws.require_rule_checkoff ? rules : []}
      rulesDocId={ws.rules_document_id}
      ackDocs={ackDocs ?? []}
    />
  );
}
