import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserProfileForm } from "./user-profile-form";
import { DocumentsList } from "@/components/documents-list";

export default async function UserProfilePage(
  props: PageProps<"/users/[id]">
) {
  const { id } = await props.params;
  const currentUser = await requireRole("admin");
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("*, user_roles(role), manager_house_assignments(house_id, houses(name), unassigned_at)")
    .eq("id", id)
    .single();

  if (!user) redirect("/users");

  const { data: houses } = await supabase
    .from("houses")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  // Get linked resident record (if any)
  const { data: residentRecord } = await supabase
    .from("residents")
    .select("id, house_id, move_in_date, sobriety_date, date_of_birth, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, status, force_photo")
    .eq("user_id", id)
    .eq("status", "active")
    .maybeSingle();

  // Get documents for this user
  const { data: documents } = await supabase
    .from("documents")
    .select("id, name, document_type, storage_path, file_size, created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  // Get activity log for this user
  const { data: activity } = await supabase
    .from("activity_log")
    .select("*")
    .eq("actor_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const roleRaw = user.user_roles;
  const role = Array.isArray(roleRaw)
    ? (roleRaw as Array<{ role: string }>)[0]?.role ?? "resident"
    : (roleRaw as { role: string } | null)?.role ?? "resident";
  const activeAssignments = (
    user.manager_house_assignments as Array<{
      house_id: string;
      houses: { name: string } | null;
      unassigned_at: string | null;
    }>
  )?.filter((a) => !a.unassigned_at);

  const assignedHouseIds = activeAssignments?.map((a) => a.house_id) ?? [];
  const isSelf = currentUser.id === id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{user.full_name}</h1>
          <p className="text-muted-foreground flex items-center gap-2">
            {user.email}
            <Badge
              variant={
                role === "admin"
                  ? "default"
                  : role === "manager"
                    ? "secondary"
                    : "outline"
              }
              className="capitalize"
            >
              {role}
            </Badge>
            {user.is_resident && (
              <Badge variant="outline">Resident</Badge>
            )}
            {!user.is_active && (
              <Badge variant="destructive">Inactive</Badge>
            )}
          </p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Role</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold capitalize">{role}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Contact</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {user.phone ? <p>{user.phone}</p> : <p className="text-muted-foreground">No phone</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Is Resident</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{user.is_resident ? "Yes" : "No"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Managed Houses</CardTitle>
          </CardHeader>
          <CardContent>
            {activeAssignments && activeAssignments.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {activeAssignments.map((a) => (
                  <Badge key={a.house_id} variant="secondary" className="text-xs">
                    {a.houses?.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">None</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Form */}
      <UserProfileForm
        userId={id}
        fullName={user.full_name}
        email={user.email}
        phone={user.phone ?? ""}
        role={role}
        isResident={user.is_resident ?? false}
        isActive={user.is_active}
        isSelf={isSelf}
        houses={houses ?? []}
        assignedHouseIds={assignedHouseIds}
        residentProfile={residentRecord ? {
          id: residentRecord.id,
          houseId: residentRecord.house_id,
          moveInDate: residentRecord.move_in_date,
          sobrietyDate: residentRecord.sobriety_date ?? "",
          dateOfBirth: residentRecord.date_of_birth ?? "",
          emergencyContactName: residentRecord.emergency_contact_name,
          emergencyContactPhone: residentRecord.emergency_contact_phone,
          emergencyContactRelationship: residentRecord.emergency_contact_relationship ?? "",
          forcePhoto: residentRecord.force_photo ?? false,
        } : null}
      />

      {/* Documents */}
      <DocumentsList documents={documents ?? []} />

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity && activity.length > 0 ? (
            <div className="space-y-2">
              {activity.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <p>{a.description}</p>
                  <span className="text-xs text-muted-foreground shrink-0 ml-4">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No activity recorded
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
