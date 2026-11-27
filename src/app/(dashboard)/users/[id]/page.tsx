import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { UserProfileForm } from "./user-profile-form";
import { HouseAssignmentsForm } from "./house-assignments-form";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireRole("admin");
  const supabase = await createClient();

  const { data: userRecord } = await supabase
    .from("users")
    .select("*, user_roles(role)")
    .eq("id", id)
    .maybeSingle();

  // Workspace isolation: an admin can only view users in their own
  // workspace. Treat a cross-workspace id the same as "not found" so
  // it can't be probed by guessing ids.
  const targetWorkspaceId =
    (userRecord as { workspace_id?: string | null } | null)?.workspace_id ??
    null;
  const outOfWorkspace =
    !!admin.workspace_id && targetWorkspaceId !== admin.workspace_id;

  if (!userRecord || outOfWorkspace) {
    return (
      <div className="space-y-4">
        <Link href="/users" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Users
        </Link>
        <p className="text-muted-foreground">User not found.</p>
      </div>
    );
  }

  const role = (userRecord.user_roles as Array<{ role: string }>)?.[0]?.role ?? "resident";

  // Get houses for assignment — scoped to the admin's workspace so the
  // manager-assignment picker never lists other workspaces' houses.
  let housesQuery = supabase
    .from("houses")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (admin.workspace_id) {
    housesQuery = housesQuery.eq("workspace_id", admin.workspace_id);
  }
  const { data: houses } = await housesQuery;

  // Get current house assignments
  const { data: assignments } = await supabase
    .from("manager_house_assignments")
    .select("house_id")
    .eq("user_id", id)
    .is("unassigned_at", null);

  const assignedHouseIds = assignments?.map((a) => a.house_id) ?? [];

  // Check if user is also a resident
  const { data: residentRecord } = await supabase
    .from("residents")
    .select("id, house_id, houses(name)")
    .eq("user_id", id)
    .eq("status", "active")
    .maybeSingle();

  return (
    <div className="space-y-6">
      <Link href="/users" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Users
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{userRecord.full_name}</h1>
        <p className="text-muted-foreground">{userRecord.email}</p>
        <div className="flex gap-2 mt-1">
          <Badge
            variant={role === "admin" ? "default" : role === "manager" ? "secondary" : "outline"}
            className="capitalize"
          >
            {role}
          </Badge>
          {!userRecord.is_active && <Badge variant="destructive">Inactive</Badge>}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Role</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold capitalize">{role}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{userRecord.phone || "N/A"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Is Resident</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{residentRecord ? "Yes" : "No"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Managed Houses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {role === "manager" && assignedHouseIds.length > 0
                ? assignedHouseIds.length
                : "None"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Edit Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <UserProfileForm
            userId={id}
            initialName={userRecord.full_name}
            initialEmail={userRecord.email}
            initialPhone={userRecord.phone ?? ""}
            initialRole={role}
          />
        </CardContent>
      </Card>

      {/* House Assignments — only for managers */}
      {role === "manager" && (
        <Card>
          <CardHeader>
            <CardTitle>House Assignments</CardTitle>
            <p className="text-sm text-muted-foreground">
              Select which houses this manager oversees.
            </p>
          </CardHeader>
          <CardContent>
            <HouseAssignmentsForm
              userId={id}
              houses={houses ?? []}
              assignedHouseIds={assignedHouseIds}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
