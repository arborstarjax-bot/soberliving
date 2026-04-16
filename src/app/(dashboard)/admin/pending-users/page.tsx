import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { PendingUsersList } from "./pending-users-list";

export default async function PendingUsersPage() {
  const user = await requireAuth();
  if (user.role !== "admin") redirect("/admin");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, full_name, email, created_at")
    .eq("account_status", "pending")
    .order("created_at", { ascending: true });

  const pending = (data ?? []).map((u) => ({
    id: u.id,
    full_name: u.full_name ?? "(no name)",
    email: u.email ?? "",
    created_at: u.created_at,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pending signups</h1>
        <p className="text-muted-foreground">
          Approve or reject accounts that have signed up but do not yet have a
          role.
        </p>
      </div>
      {error && (
        <p className="text-sm text-destructive">
          Failed to load pending users: {error.message}
        </p>
      )}
      <PendingUsersList users={pending} />
    </div>
  );
}
