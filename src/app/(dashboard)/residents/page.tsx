import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDaysSober } from "@/lib/milestones";
import { Users } from "lucide-react";
import Link from "next/link";

export default async function ResidentsPage() {
  const user = await requireAuth();
  const supabase = createAdminClient();
  const houseFilter = getAccessibleHouseFilter(user);

  // Query users with is_resident=true, joining residents table for profile data
  const { data: residentUsers } = await supabase
    .from("users")
    .select(
      "id, full_name, email, phone, is_resident, user_roles(role), residents(id, house_id, status, move_in_date, sobriety_date, houses(name))"
    )
    .eq("is_resident", true)
    .order("full_name");

  // Also get residents that exist in the residents table but may not have is_resident set on user
  // (legacy records created via the old Add Resident flow)
  const { data: standaloneResidents } = await supabase
    .from("residents")
    .select(
      "id, user_id, full_name, status, move_in_date, sobriety_date, house_id, houses(name)"
    )
    .order("full_name");

  // Build a combined list
  type ResidentEntry = {
    key: string;
    fullName: string;
    email?: string;
    houseName?: string;
    houseId?: string;
    moveInDate?: string;
    sobrietyDate?: string;
    status: string;
    residentId?: string; // residents table id (for /residents/[id] link)
    userId?: string; // users table id (for /users/[id] link)
    hasProfile: boolean; // whether they have a residents table record
  };

  const entries: ResidentEntry[] = [];
  const seenResidentIds = new Set<string>();
  const seenUserIds = new Set<string>();

  // First, add entries from users with is_resident=true
  for (const u of residentUsers ?? []) {
    seenUserIds.add(u.id);
    const residentsRaw = u.residents as unknown as Array<{
      id: string;
      house_id: string;
      status: string;
      move_in_date: string;
      sobriety_date: string | null;
      houses: { name: string } | null;
    }> | null;

    if (residentsRaw && residentsRaw.length > 0) {
      // User has one or more residents records
      for (const r of residentsRaw) {
        seenResidentIds.add(r.id);

        // Apply house filter for managers
        if (houseFilter && !houseFilter.includes(r.house_id)) continue;

        entries.push({
          key: `r-${r.id}`,
          fullName: u.full_name,
          email: u.email,
          houseName: r.houses?.name,
          houseId: r.house_id,
          moveInDate: r.move_in_date,
          sobrietyDate: r.sobriety_date ?? undefined,
          status: r.status,
          residentId: r.id,
          userId: u.id,
          hasProfile: true,
        });
      }
    } else {
      // User has is_resident=true but no residents record yet
      // Only show to admins (no house to filter on)
      if (!houseFilter) {
        entries.push({
          key: `u-${u.id}`,
          fullName: u.full_name,
          email: u.email,
          status: "active",
          userId: u.id,
          hasProfile: false,
        });
      }
    }
  }

  // Then add any standalone residents not already covered (legacy records without user link or is_resident)
  for (const r of standaloneResidents ?? []) {
    if (seenResidentIds.has(r.id)) continue;
    if (r.user_id && seenUserIds.has(r.user_id)) continue;

    // Apply house filter for managers
    if (houseFilter && !houseFilter.includes(r.house_id)) continue;

    entries.push({
      key: `r-${r.id}`,
      fullName: r.full_name,
      houseName: (r.houses as unknown as { name: string } | null)?.name,
      houseId: r.house_id,
      moveInDate: r.move_in_date,
      sobrietyDate: r.sobriety_date ?? undefined,
      status: r.status,
      residentId: r.id,
      userId: r.user_id ?? undefined,
      hasProfile: true,
    });
  }

  const activeEntries = entries.filter((e) => e.status === "active");
  const otherEntries = entries.filter((e) => e.status !== "active");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Residents</h1>
          <p className="text-muted-foreground">
            {activeEntries.length} active residents
          </p>
        </div>
        {(user.role === "admin" || user.role === "manager") && (
          <Link
            href="/users"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Users className="mr-2 h-4 w-4" />
            Add via Users & Roles
          </Link>
        )}
      </div>

      {activeEntries.length === 0 && otherEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              No residents yet. Go to{" "}
              <Link href="/users" className="underline font-medium">
                Users & Roles
              </Link>{" "}
              and add a user with the &quot;Is Resident&quot; option checked.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {activeEntries.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Active</h2>
              {activeEntries.map((e) => (
                <Link
                  key={e.key}
                  href={
                    e.residentId
                      ? `/residents/${e.residentId}`
                      : `/users/${e.userId}`
                  }
                >
                  <Card className="hover:bg-muted/50 transition-colors">
                    <CardContent className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium">
                          {e.fullName}
                          {!e.hasProfile && (
                            <Badge
                              variant="secondary"
                              className="ml-2 text-xs"
                            >
                              Profile Incomplete
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {e.houseName
                            ? `${e.houseName} · Moved in ${new Date(e.moveInDate!).toLocaleDateString()}`
                            : e.email ?? "No house assigned"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {e.sobrietyDate && (
                          <span className="text-xs text-muted-foreground">
                            {getDaysSober(e.sobrietyDate)} days sober
                          </span>
                        )}
                        <Badge variant="outline" className="capitalize">
                          {e.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {otherEntries.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-muted-foreground">
                Discharged / On Leave
              </h2>
              {otherEntries.map((e) => (
                <Link
                  key={e.key}
                  href={
                    e.residentId
                      ? `/residents/${e.residentId}`
                      : `/users/${e.userId}`
                  }
                >
                  <Card className="hover:bg-muted/50 transition-colors opacity-60">
                    <CardContent className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium">{e.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {e.houseName ?? e.email ?? ""}
                        </p>
                      </div>
                      <Badge
                        variant={
                          e.status === "discharged" ? "secondary" : "outline"
                        }
                        className="capitalize"
                      >
                        {e.status.replace("_", " ")}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
