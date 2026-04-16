"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import Link from "next/link";
import { DeleteResidentButton } from "./delete-resident-button";
import { IntakeReviewForm } from "../intake-review/intake-review-form";
import { MarkCompleteButton } from "../intake-review/mark-complete-button";
import { SendCheckInDialog } from "./check-ins/send-checkin-dialog";
import { CheckInList } from "./check-ins/checkin-list";

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
  address?: string | null;
}

interface IntakePendingUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  intakeFormData: Record<string, unknown>;
  completedAt: string | null;
}

interface IntakeAwaitingUser {
  id: string;
  full_name: string;
  email: string;
}

interface CheckInResponseSummary {
  id: string;
  residentName: string;
  status: string;
  completedAt: string | null;
  formData: Record<string, unknown> | null;
  houseId: string;
}

interface CheckInBatch {
  id: string;
  createdBy: string;
  houseNames: string;
  houseIds: string[];
  createdAt: string;
  completedCount: number;
  totalCount: number;
  responses: CheckInResponseSummary[];
}

// Unified person type for the merged list
interface UnifiedPerson {
  key: string;
  full_name: string;
  staffRole: string | null; // "admin" | "manager" | null
  isResident: boolean;
  residentId: string | null;
  userId: string | null;
  house_name: string;
  house_id: string | null;
  move_in_date: string | null;
  days_sober: number | null;
  status: string; // "active" | "discharged" | etc.
  email: string | null;
  assigned_house_names: string[];
  is_active: boolean;
  sortOrder: number; // 0 = admin, 1 = manager, 2 = resident
}

interface ResidentsTabsProps {
  houses: House[];
  residents: Resident[];
  staffUsers: StaffUser[];
  isAdmin: boolean;
  isStaff: boolean;
  intakePending?: IntakePendingUser[];
  intakeAwaiting?: IntakeAwaitingUser[];
  checkInBatches?: CheckInBatch[];
}

export function ResidentsTabs({
  houses,
  residents,
  staffUsers,
  isAdmin,
  isStaff,
  intakePending = [],
  intakeAwaiting = [],
  checkInBatches = [],
}: ResidentsTabsProps) {
  const [topTab, setTopTab] = useState<string>("residents");
  // Build a unified list of all people
  // Start with staff users (they sort first)
  const staffResidentIds = new Set(
    staffUsers.filter((s) => s.resident_id).map((s) => s.resident_id)
  );

  const unifiedPeople: UnifiedPerson[] = [];

  // Add staff users first
  for (const s of staffUsers) {
    const matchingResident = s.resident_id
      ? residents.find((r) => r.id === s.resident_id)
      : null;
    unifiedPeople.push({
      key: `staff-${s.user_id}`,
      full_name: s.full_name,
      staffRole: s.role,
      isResident: s.is_also_resident,
      residentId: s.resident_id,
      userId: s.user_id,
      house_name: matchingResident?.house_name ?? s.assigned_house_names[0] ?? "",
      house_id: matchingResident?.house_id ?? (s.assigned_house_ids[0] || null),
      move_in_date: matchingResident?.move_in_date ?? null,
      days_sober: matchingResident?.days_sober ?? null,
      status: matchingResident?.status ?? "active",
      email: s.email,
      assigned_house_names: s.assigned_house_names,
      is_active: s.is_active,
      sortOrder: s.role === "admin" ? 0 : 1,
    });
  }

  // Add residents who are NOT already represented as staff
  for (const r of residents) {
    if (staffResidentIds.has(r.id)) continue;
    unifiedPeople.push({
      key: `resident-${r.id}`,
      full_name: r.full_name,
      staffRole: null,
      isResident: true,
      residentId: r.id,
      userId: null,
      house_name: r.house_name,
      house_id: r.house_id,
      move_in_date: r.move_in_date,
      days_sober: r.days_sober,
      status: r.status,
      email: null,
      assigned_house_names: [],
      is_active: true,
      sortOrder: 2,
    });
  }

  // Sort: admin first, then manager, then resident
  unifiedPeople.sort((a, b) => a.sortOrder - b.sortOrder || a.full_name.localeCompare(b.full_name));

  const activePeople = unifiedPeople.filter((p) => p.status === "active");
  const otherPeople = unifiedPeople.filter((p) => p.status !== "active");

  // Build tabs: "All" + one per house
  const tabs = [
    { value: "all", label: "All", houseId: null as string | null },
    ...houses.map((h) => ({ value: h.id, label: h.name, houseId: h.id as string | null })),
  ];

  function filterByHouse(list: UnifiedPerson[], houseId: string | null) {
    if (!houseId) return list;
    return list.filter((p) => {
      // Staff with admin role show in every house tab
      if (p.staffRole === "admin") return true;
      // Managers show in houses they're assigned to
      if (p.staffRole === "manager" && p.assigned_house_names.length > 0) {
        const staffUser = staffUsers.find((s) => s.user_id === p.userId);
        return staffUser?.assigned_house_ids.includes(houseId) ?? false;
      }
      // Residents show in their house
      return p.house_id === houseId;
    });
  }

  function renderPersonCard(p: UnifiedPerson) {
    const href = p.residentId
      ? `/residents/${p.residentId}`
      : p.userId && isAdmin
        ? `/users/${p.userId}`
        : "#";

    return (
      <Link key={p.key} href={href}>
        <Card className={`hover:bg-muted/50 transition-colors ${p.status !== "active" ? "opacity-60" : ""}`}>
          <CardContent className="flex items-center justify-between py-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{p.full_name}</span>
                {p.staffRole === "admin" && (
                  <Badge variant="default">Admin</Badge>
                )}
                {p.staffRole === "manager" && (
                  <Badge variant="secondary">Manager</Badge>
                )}
                {p.isResident && (
                  <Badge variant="outline">Resident</Badge>
                )}
                {!p.is_active && <Badge variant="destructive">Inactive</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {p.house_name}
                {p.move_in_date && ` · Moved in ${new Date(p.move_in_date).toLocaleDateString()}`}
                {p.staffRole === "manager" && p.assigned_house_names.length > 0 && (
                  ` · Houses: ${p.assigned_house_names.join(", ")}`
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {p.days_sober !== null && (
                <span className="text-xs text-muted-foreground">
                  {p.days_sober} days sober
                </span>
              )}
              {p.status !== "active" && (
                <Badge
                  variant={p.status === "discharged" ? "secondary" : "outline"}
                  className="capitalize"
                >
                  {p.status.replace("_", " ")}
                </Badge>
              )}
              {isAdmin && p.residentId && (
                <DeleteResidentButton
                  residentId={p.residentId}
                  residentName={p.full_name}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  }

  const intakeCount = intakePending.length + intakeAwaiting.length;

  // Houses with address for intake form
  const housesWithAddress = houses.map((h) => ({
    id: h.id,
    name: h.name,
    address: h.address ?? null,
  }));

  return (
    <div className="space-y-4">
      {/* Top-level section tabs: Residents | Intake */}
      {isStaff && (
        <div className="flex gap-2 border-b pb-2">
          <button
            onClick={() => setTopTab("residents")}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              topTab === "residents"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Residents
          </button>
          <button
            onClick={() => setTopTab("intake")}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors flex items-center gap-1.5 ${
              topTab === "intake"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Intake
            {intakeCount > 0 && (
              <Badge variant={topTab === "intake" ? "secondary" : "destructive"} className="text-[10px] px-1.5 py-0">
                {intakeCount}
              </Badge>
            )}
          </button>
          <button
            onClick={() => setTopTab("checkins")}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors flex items-center gap-1.5 ${
              topTab === "checkins"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Check Ins
            {checkInBatches.length > 0 && (
              <Badge variant={topTab === "checkins" ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
                {checkInBatches.length}
              </Badge>
            )}
          </button>
        </div>
      )}

      {/* Residents view */}
      {topTab === "residents" && (
        <Tabs defaultValue="all">
          <TabsList>
            {tabs.map((tab) => {
              const count = tab.houseId
                ? activePeople.filter((p) => {
                    if (p.staffRole === "admin") return true;
                    if (p.staffRole === "manager") {
                      const su = staffUsers.find((s) => s.user_id === p.userId);
                      return su?.assigned_house_ids.includes(tab.houseId!) ?? false;
                    }
                    return p.house_id === tab.houseId;
                  }).length
                : activePeople.length;
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
            const houseActive = filterByHouse(activePeople, tab.houseId);
            const houseOther = filterByHouse(otherPeople, tab.houseId);
            const isEmpty = houseActive.length === 0 && houseOther.length === 0;

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
                      {houseActive.length > 0 && (
                        <div className="space-y-2">
                          {houseActive.map(renderPersonCard)}
                        </div>
                      )}

                      {houseOther.length > 0 && (
                        <div className="space-y-2">
                          <h2 className="text-lg font-semibold text-muted-foreground">
                            Discharged / On Leave
                          </h2>
                          {houseOther.map(renderPersonCard)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {/* Intake view */}
      {topTab === "intake" && (
        <div className="space-y-6">
          {/* Awaiting Resident Signature */}
          {intakeAwaiting.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Awaiting Resident Signature
                  <Badge variant="secondary">{intakeAwaiting.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {intakeAwaiting.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-yellow-50"
                    >
                      <div>
                        <p className="font-medium">{user.full_name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <MarkCompleteButton userId={user.id} userName={user.full_name} />
                        <Badge variant="outline" className="text-yellow-700 border-yellow-400">
                          Pending Resident Signature
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pending Intake Reviews */}
          {intakePending.length === 0 && intakeAwaiting.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No pending intake reviews. New applications will appear here when residents complete their intake form.
                </p>
              </CardContent>
            </Card>
          ) : (
            intakePending.map((user) => {
              const fd = user.intakeFormData;
              return (
                <Card key={user.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{user.full_name}</CardTitle>
                      <Badge>Application Complete</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {user.email} {user.phone ? `• ${user.phone}` : ""}
                      {user.completedAt
                        ? ` • Completed ${new Date(user.completedAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {/* Intake Summary */}
                    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Date of Birth:</span>{" "}
                        <span className="font-medium">{(fd.date_of_birth as string) || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Gender:</span>{" "}
                        <span className="font-medium">{(fd.gender as string) || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Phone:</span>{" "}
                        <span className="font-medium">{(fd.phone as string) || user.phone || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Sobriety Date:</span>{" "}
                        <span className="font-medium">{(fd.sobriety_date as string) || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Drug of Choice:</span>{" "}
                        <span className="font-medium">{(fd.drug_of_choice as string) || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Emergency Contact:</span>{" "}
                        <span className="font-medium">
                          {(fd.emergency_contact_1_name as string) || "—"}
                          {fd.emergency_contact_1_phone ? ` (${fd.emergency_contact_1_phone})` : ""}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Referral:</span>{" "}
                        <span className="font-medium">{(fd.referral_source as string) || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">In Recovery Program:</span>{" "}
                        <span className="font-medium">{(fd.in_recovery_program as string) || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Owns Vehicle:</span>{" "}
                        <span className="font-medium">{(fd.owns_vehicle as string) || "—"}</span>
                      </div>
                    </div>

                    {/* Assignment Form */}
                    <IntakeReviewForm
                      userId={user.id}
                      userName={user.full_name}
                      houses={housesWithAddress}
                    />
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
      {/* Check Ins view */}
      {topTab === "checkins" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Monthly Check-Ins</h2>
            <SendCheckInDialog houses={houses} />
          </div>
          <CheckInList batches={checkInBatches} />
        </div>
      )}
    </div>
  );
}
