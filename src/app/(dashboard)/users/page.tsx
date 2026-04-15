import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateUserDialog } from "./create-user-dialog";
import Link from "next/link";

export default async function UsersPage() {
  await requireRole("admin");
  const supabase = createAdminClient();

  const { data: users } = await supabase
    .from("users")
    .select("*, user_roles(role), manager_house_assignments(house_id, houses(name), unassigned_at)")
    .order("full_name");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users & Roles</h1>
          <p className="text-muted-foreground">
            Manage staff and resident accounts
          </p>
        </div>
        <CreateUserDialog />
      </div>

      <div className="space-y-2">
        {(users ?? []).map((u) => {
          const roleRecord = (u.user_roles as Array<{ role: string }>)?.[0];
          const role = roleRecord?.role ?? "resident";
          const activeAssignments = (
            u.manager_house_assignments as Array<{
              house_id: string;
              houses: { name: string } | null;
              unassigned_at: string | null;
            }>
          )?.filter((a) => !a.unassigned_at);

          return (
            <Link key={u.id} href={`/users/${u.id}`} className="block">
              <Card className={`hover:bg-accent/50 transition-colors cursor-pointer ${!u.is_active ? "opacity-50" : ""}`}>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{u.full_name}</span>
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
                      {u.is_resident && role !== "resident" && (
                        <Badge variant="outline">Resident</Badge>
                      )}
                      {!u.is_active && (
                        <Badge variant="destructive">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                    {(role === "manager" || role === "admin") && activeAssignments?.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Houses:{" "}
                        {activeAssignments
                          .map((a) => a.houses?.name)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-foreground text-sm">→</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
