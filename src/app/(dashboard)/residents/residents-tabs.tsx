"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import Link from "next/link";
import { DeleteResidentButton } from "./delete-resident-button";

interface Resident {
  id: string;
  full_name: string;
  status: string;
  move_in_date: string;
  sobriety_date: string | null;
  house_id: string;
  house_name: string;
  days_sober: number | null;
}

interface StaffUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  assigned_house_ids: string[];
  assigned_house_names: string[];
  is_also_resident: boolean;
  resident_id: string | null;
}

interface House {
  id: string;
  name: string;
}

interface ResidentsTabsProps {
  houses: House[];
  residents: Resident[];
  staffUsers: StaffUser[];
  isAdmin: boolean;
  isStaff: boolean;
}

export function ResidentsTabs({
  houses,
  residents,
  staffUsers,
  isAdmin,
  isStaff,
}: ResidentsTabsProps) {
  const activeResidents = residents.filter((r) => r.status === "active");
  const otherResidents = residents.filter((r) => r.status !== "active");

  // Build tabs: "All" + one per house
  const tabs = [
    { value: 0, label: "All", houseId: null },
    ...houses.map((h, i) => ({ value: i + 1, label: h.name, houseId: h.id })),
  ];

  function getStaffForHouse(houseId: string | null) {
    if (!houseId) return staffUsers.filter((u) => u.role === "admin" || u.role === "manager");
    return staffUsers.filter(
      (u) =>
        u.role === "admin" ||
        (u.role === "manager" && u.assigned_house_ids.includes(houseId))
    );
  }

  function getResidentsForHouse(houseId: string | null, list: Resident[]) {
    if (!houseId) return list;
    return list.filter((r) => r.house_id === houseId);
  }

  return (
    <Tabs defaultValue={0}>
      <TabsList>
        {tabs.map((tab) => {
          const count = tab.houseId
            ? activeResidents.filter((r) => r.house_id === tab.houseId).length
            : activeResidents.length;
          return (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
              {count > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                  {count}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {tabs.map((tab) => {
        const houseStaff = getStaffForHouse(tab.houseId);
        const houseActiveResidents = getResidentsForHouse(tab.houseId, activeResidents);
        const houseOtherResidents = getResidentsForHouse(tab.houseId, otherResidents);
        const isEmpty = houseStaff.length === 0 && houseActiveResidents.length === 0 && houseOtherResidents.length === 0;

        return (
          <TabsContent key={tab.value} value={tab.value}>
            <div className="space-y-6 pt-2">
              {isEmpty ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-muted-foreground">
                      No residents in this house yet.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Staff / Managers / Admins — shown first */}
                  {isStaff && houseStaff.length > 0 && (
                    <div className="space-y-2">
                      <h2 className="text-lg font-semibold">Staff</h2>
                      {houseStaff.map((u) => (
                        <Link key={u.user_id} href={isAdmin ? `/users/${u.user_id}` : "#"}>
                          <Card className="hover:bg-muted/50 transition-colors">
                            <CardContent className="flex items-center justify-between py-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{u.full_name}</span>
                                  <Badge
                                    variant={u.role === "admin" ? "default" : "secondary"}
                                    className="capitalize"
                                  >
                                    {u.role}
                                  </Badge>
                                  {u.is_also_resident && (
                                    <Badge variant="outline">Resident</Badge>
                                  )}
                                  {!u.is_active && <Badge variant="destructive">Inactive</Badge>}
                                </div>
                                <p className="text-xs text-muted-foreground">{u.email}</p>
                                {u.role === "manager" && u.assigned_house_names.length > 0 && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    Houses: {u.assigned_house_names.join(", ")}
                                  </p>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Active Residents */}
                  {houseActiveResidents.length > 0 && (
                    <div className="space-y-2">
                      <h2 className="text-lg font-semibold">Active Residents</h2>
                      {houseActiveResidents.map((r) => {
                        // Skip if this resident is already shown as staff
                        const shownAsStaff = houseStaff.some((s) => s.resident_id === r.id);
                        if (shownAsStaff) return null;
                        return (
                          <Link key={r.id} href={`/residents/${r.id}`}>
                            <Card className="hover:bg-muted/50 transition-colors">
                              <CardContent className="flex items-center justify-between py-3">
                                <div>
                                  <p className="font-medium">{r.full_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {r.house_name} · Moved in{" "}
                                    {new Date(r.move_in_date).toLocaleDateString()}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {r.days_sober !== null && (
                                    <span className="text-xs text-muted-foreground">
                                      {r.days_sober} days sober
                                    </span>
                                  )}
                                  <Badge variant="outline" className="capitalize">
                                    {r.status}
                                  </Badge>
                                  {isAdmin && (
                                    <DeleteResidentButton
                                      residentId={r.id}
                                      residentName={r.full_name}
                                    />
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          </Link>
                        );
                      })}
                    </div>
                  )}

                  {/* Discharged / On Leave */}
                  {houseOtherResidents.length > 0 && (
                    <div className="space-y-2">
                      <h2 className="text-lg font-semibold text-muted-foreground">
                        Discharged / On Leave
                      </h2>
                      {houseOtherResidents.map((r) => (
                        <Link key={r.id} href={`/residents/${r.id}`}>
                          <Card className="hover:bg-muted/50 transition-colors opacity-60">
                            <CardContent className="flex items-center justify-between py-3">
                              <div>
                                <p className="font-medium">{r.full_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {r.house_name}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={r.status === "discharged" ? "secondary" : "outline"}
                                  className="capitalize"
                                >
                                  {r.status.replace("_", " ")}
                                </Badge>
                                {isAdmin && (
                                  <DeleteResidentButton
                                    residentId={r.id}
                                    residentName={r.full_name}
                                  />
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
