import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { VaultView } from "./vault-view";

export const dynamic = "force-dynamic";

export default async function AdminDocumentsPage() {
  const user = await requireAuth();
  if (user.role !== "admin") redirect("/dashboard");

  const admin = createAdminClient();
  const { data: docs } = await admin
    .from("documents")
    .select("id, name, storage_path, file_size, created_at")
    .eq("workspace_id", user.workspace_id)
    .eq("document_type", "vault")
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Document Vault</h1>
        <p className="text-muted-foreground">
          Workspace documents any admin can view, download, or email.
        </p>
      </div>
      <VaultView docs={docs ?? []} />
    </div>
  );
}
