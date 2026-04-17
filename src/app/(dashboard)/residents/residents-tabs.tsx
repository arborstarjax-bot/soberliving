"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import Link from "next/link";
import { DeleteResidentButton } from "./delete-resident-button";
import { MarkCompleteButton } from "../intake-review/mark-complete-button";
import { ApplicationReview } from "../intake-review/application-review";
import { ReopenButton } from "../intake-review/reopen-button";
import { ResendInviteButton } from "../users/resend-invite-button";
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

interface IntakeDeniedUser {
  id: string;
  full_name: string;
  email: string;
  denialReason: string | null;
  deniedAt: string | null;
}

interface IntakeInvitedUser {
  id: string;
  full_name: string;
  email: string;
  createdAt: string;
}

interface IntakeInProgressUser {
  id: string;
  full_name: string;
  email: string;
  lastUpdatedAt: string | null;
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
  intakeInvited?: IntakeInvitedUser[];
  intakeInProgress?: IntakeInProgressUser[];
  intakePending?: IntakePendingUser[];
  intakeAwaiting?: IntakeAwaitingUser[];
  intakeDenied?: IntakeDeniedUser[];
  checkInBatches?: CheckInBatch[];
}

export function ResidentsTabs({
  houses,
  residents,
  staffUsers,
  isAdmin,
  isStaff,
  intakeInvited = [],
  intakeInProgress = [],
  intakePending = [],
  intakeAwaiting = [],
  intakeDenied = [],
  checkInBatches = [],
}: ResidentsTabsProps) {
  const [topTab, setTopTab] = useState<string>("residents");
  const [intakeSubTab, setIntakeSubTab] = useState<"pending" | "denied">(
    "pending"
  );
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
  const onLeavePeople = unifiedPeople.filter((p) => p.status === "on_leave");
  const dischargedPeople = unifiedPeople.filter(
    (p) => p.status === "discharged"
  );

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

  const pendingIntakeCount =
    intakeInvited.length +
    intakeInProgress.length +
    intakePending.length +
    intakeAwaiting.length;
  const intakeCount = pendingIntakeCount + intakeDenied.length;

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
          {isAdmin && (
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
          )}
          <button
            onClick={() => setTopTab("checkins")}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors flex items-center gap-1.5 ${
              topTab === "checkins"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Check Ins
          </button>
          <button
            onClick={() => setTopTab("on_leave")}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors flex items-center gap-1.5 ${
              topTab === "on_leave"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            On Leave
            {onLeavePeople.length > 0 && (
              <Badge
                variant={topTab === "on_leave" ? "secondary" : "outline"}
                className="text-[10px] px-1.5 py-0"
              >
                {onLeavePeople.length}
              </Badge>
            )}
          </button>
          <button
            onClick={() => setTopTab("discharged")}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors flex items-center gap-1.5 ${
              topTab === "discharged"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Discharged
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
            const isEmpty = houseActive.length === 0;

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
                    <div className="space-y-2">
                      {houseActive.map(renderPersonCard)}
                    </div>
                  )}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {/* On Leave view */}
      {topTab === "on_leave" && (
        <StatusPeopleTabs
          tabs={tabs}
          people={onLeavePeople}
          filterByHouse={filterByHouse}
          renderPersonCard={renderPersonCard}
          emptyLabel="No residents currently on leave."
        />
      )}

      {/* Discharged view */}
      {topTab === "discharged" && (
        <StatusPeopleTabs
          tabs={tabs}
          people={dischargedPeople}
          filterByHouse={filterByHouse}
          renderPersonCard={renderPersonCard}
          emptyLabel="No discharged residents."
        />
      )}

      {/* Intake view */}
      {topTab === "intake" && (
        <div className="space-y-4">
          <Tabs
            value={intakeSubTab}
            onValueChange={(v) =>
              setIntakeSubTab(v as "pending" | "denied")
            }
          >
            <TabsList className="flex h-auto w-full justify-start overflow-x-auto no-scrollbar [&>button]:flex-none [&>button]:whitespace-nowrap">
              <TabsTrigger value="pending" className="gap-2">
                Pending
                <Badge variant="secondary">{pendingIntakeCount}</Badge>
              </TabsTrigger>
              <TabsTrigger value="denied" className="gap-2">
                Denied
                <Badge variant="secondary">{intakeDenied.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-6 mt-4">
              {pendingIntakeCount === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">
                      No users in intake. New residents show up here after
                      you invite them, and move through each stage until
                      their commitment is signed.
                    </p>
                  </CardContent>
                </Card>
              )}

          {/* 1. Invited — awaiting intake */}
          {intakeInvited.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  Invited — Awaiting Intake
                  <Badge variant="secondary">{intakeInvited.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {intakeInvited.map((user) => (
                    <div
                      key={user.id}
                      className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{user.full_name}</p>
                        <p className="text-sm text-muted-foreground break-all">
                          {user.email}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Invited{" "}
                          {new Date(user.createdAt).toLocaleDateString()} ·
                          Account created — hasn&apos;t started the intake form
                          yet.
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <ResendInviteButton
                          userId={user.id}
                          userName={user.full_name}
                          email={user.email}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 2. Intake in progress */}
          {intakeInProgress.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  Intake In Progress
                  <Badge variant="secondary">{intakeInProgress.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {intakeInProgress.map((user) => (
                    <div
                      key={user.id}
                      className="flex flex-col gap-2 rounded-lg border bg-blue-50/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{user.full_name}</p>
                        <p className="text-sm text-muted-foreground break-all">
                          {user.email}
                        </p>
                        {user.lastUpdatedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Last updated{" "}
                            {new Date(user.lastUpdatedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-blue-700 border-blue-400"
                        >
                          Filling out application
                        </Badge>
                        <ResendInviteButton
                          userId={user.id}
                          userName={user.full_name}
                          email={user.email}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 3. Awaiting Review */}
          {intakePending.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  Awaiting Review
                  <Badge variant="secondary">{intakePending.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {intakePending.map((user) => (
                  <div
                    key={user.id}
                    className="rounded-lg border bg-background p-4"
                  >
                    <ApplicationReview
                      userId={user.id}
                      userName={user.full_name}
                      email={user.email}
                      phone={user.phone}
                      submittedAt={user.completedAt}
                      houses={housesWithAddress}
                      isAdmin={isAdmin}
                      formData={user.intakeFormData}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* 4. Awaiting Resident Signature */}
          {intakeAwaiting.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  Awaiting Resident Signature
                  <Badge variant="secondary">{intakeAwaiting.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {intakeAwaiting.map((user) => (
                    <div
                      key={user.id}
                      className="flex flex-col gap-2 rounded-lg border bg-yellow-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{user.full_name}</p>
                        <p className="text-sm text-muted-foreground break-all">
                          {user.email}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <MarkCompleteButton
                          userId={user.id}
                          userName={user.full_name}
                        />
                        <Badge
                          variant="outline"
                          className="text-yellow-700 border-yellow-400"
                        >
                          Pending Resident Signature
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
            </TabsContent>

            <TabsContent value="denied" className="space-y-6 mt-4">
              {intakeDenied.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">
                      No denied applications. Applicants you deny will show
                      up here with their denial reason.
                    </p>
                  </CardContent>
                </Card>
              )}

          {/* 5. Denied */}
          {intakeDenied.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                  Denied Applications
                  <Badge variant="secondary">{intakeDenied.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {intakeDenied.map((user) => (
                    <div
                      key={user.id}
                      className="flex flex-col gap-2 rounded-lg border bg-red-50/50 p-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{user.full_name}</p>
                        <p className="text-sm text-muted-foreground break-all">
                          {user.email}
                        </p>
                        {user.deniedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Denied{" "}
                            {new Date(user.deniedAt).toLocaleDateString()}
                          </p>
                        )}
                        {user.denialReason?.trim() && (
                          <p className="mt-2 rounded-md border bg-background p-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              Reason:
                            </span>{" "}
                            {user.denialReason}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="destructive">Denied</Badge>
                        {isAdmin && (
                          <ReopenButton
                            userId={user.id}
                            userName={user.full_name}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
            </TabsContent>
          </Tabs>
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

interface StatusPeopleTabsProps {
  tabs: { value: string; label: string; houseId: string | null }[];
  people: UnifiedPerson[];
  filterByHouse: (list: UnifiedPerson[], houseId: string | null) => UnifiedPerson[];
  renderPersonCard: (p: UnifiedPerson) => React.ReactNode;
  emptyLabel: string;
}

function StatusPeopleTabs({
  tabs,
  people,
  filterByHouse,
  renderPersonCard,
  emptyLabel,
}: StatusPeopleTabsProps) {
  return (
    <Tabs defaultValue="all">
      <TabsList>
        {tabs.map((tab) => {
          const count = filterByHouse(people, tab.houseId).length;
          return (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
              {count > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1.5 text-[10px] px-1.5 py-0"
                >
                  {count}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {tabs.map((tab) => {
        const items = filterByHouse(people, tab.houseId);
        return (
          <TabsContent key={tab.value} value={tab.value}>
            <div className="pt-2">
              {items.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-muted-foreground">{emptyLabel}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">{items.map(renderPersonCard)}</div>
              )}
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
