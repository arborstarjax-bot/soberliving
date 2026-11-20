"use server";

import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export async function completeIntakeChecklist(formData: FormData) {
  const user = await requireAuth();
  const admin = createAdminClient();

  const steps = JSON.parse(
    (formData.get("checked_steps") as string) ?? "[]"
  ) as string[];
  for (const stepId of steps) {
    await admin.from("intake_checkoffs").upsert(
      {
        user_id: user.id,
        workspace_id: user.workspace_id,
        step_id: stepId,
      },
      { onConflict: "user_id,workspace_id,step_id" }
    );
  }

  const acks = JSON.parse(
    (formData.get("acks") as string) ?? "[]"
  ) as { document_id: string; signature: string }[];
  for (const a of acks) {
    if (!a.signature?.startsWith("data:image/")) continue;
    await admin.from("document_acknowledgments").upsert(
      {
        document_id: a.document_id,
        user_id: user.id,
        signature: a.signature,
      },
      { onConflict: "document_id,user_id" }
    );
  }
  return {};
}
