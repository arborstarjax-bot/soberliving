"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Users, Phone } from "lucide-react";
import Link from "next/link";
import { DeleteResidentButton } from "./delete-resident-button";
import { MarkCompleteButton } from "../intake-review/mark-complete-button";
import { ApplicationReview } from "../intake-review/application-review";
import { ViewResentApplicationDialog } from "./view-resent-application-dialog";
import { ReopenButton } from "../intake-review/reopen-button";
import { EditPendingCommitmentDialog } from "../intake-review/edit-pending-commitment-dialog";
import { ResendCommitmentButton } from "../intake-review/resend-commitment-button";
import { ResendInviteButton } from "../users/resend-invite-button";
import { DeleteIntakeButton } from "./delete-intake-button";
import { ResendApplicationButton } from "./resend-application-button";
import { SignOffResendButton } from "./signoff-resend-button";
import { SendCheckInDialog } from "./check-ins/send-checkin-dialog";
import { CheckInList } from "./check-ins/checkin-list";
import { formatDateOnly } from "@/lib/timezone";

function getSobrietyBadgeClasses(days: number): string {
  if (days <= 30) return "bg-rose-50 text-rose-700";
  if (days <= 90) return "bg-amber-50 text-amber-700";
  if (days <= 180) return "bg-lime-50 text-lime-700";
  if (days <= 365) return "bg-emerald-50 text-emerald-700";
  return "bg-blue-50 text-blue-700";
}

interface Resident {
  id: string;
  full_name: string;
  phone: string | null;
  status: string;
  move_in_date: string;
  sobriety_date: string | null;
  house_id: string;
  house_name: string;
  days_sober: number | null;
  bed_label: string | null;
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
  intakeSignatures: Record<string, string>;
  staffSignedOffAt: string | null;
  completedAt: string | null;
}

interface IntakeAwaitingUser {
  id: string;
  full_name: string;
  email: string;
  commitment: {
    paymentFrequency: "weekly" | "monthly";
    rentAmount: number;
    adminFee: number;
    commitmentStartDate: string;
    commitmentTerm: string;
    notes: string | null;
    isAmendment: boolean;
  } | null;
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
  phone: string | null;
  staffRole: string | null; // "admin" | "manager" | null
  isResident: boolean;
  residentId: string | null;
  userId: string | null;
  house_name: string;
  house_id: string | null;
  move_in_date: string | null;
  days_sober: number | null;
  bed_label: string | null;
  status: string; // "active" | "discharged" | etc.
  email: string | null;
  assigned_house_names: string[];
  is_active: boolean;
  sortOrder: number; // 0 = admin, 1 = manager, 2 = resident
}

interface ResentApplication {
  userId: string;
  full_name: string;
  email: string;
  status: "awaiting_completion" | "pending_review";
  intakeFormData: Record<string, unknown> | null;
  intakeSignatures: Record<string, string> | null;
  completedAt: string | null;
  residentId: string | null;
  houseName: string | null;
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
  requireCommitment?: boolean;
  requireApplication?: boolean;
  facilityName?: string;
  resentApplications?: ResentApplication[];
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
  requireCommitment = true,
  requireApplication = true,
  facilityName = "Sober Living",
  resentApplications = [],
}: ResidentsTabsProps) {
  const [topTab, setTopTab] = useState<string>("residents");
  const [intakeSubTab, setIntakeSubTab] = useState<"pending" | "denied">(
    "pending"
  );
  const [archiveFilter, setArchiveFilter] = useState<"all" | "on_leave" | "discharged">("all");
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
      phone: matchingResident?.phone ?? null,
      staffRole: s.role,
      isResident: s.is_also_resident,
      residentId: s.resident_id,
      userId: s.user_id,
      house_name: matchingResident?.house_name ?? s.assigned_house_names[0] ?? "",
      house_id: matchingResident?.house_id ?? (s.assigned_house_ids[0] || null),
      move_in_date: matchingResident?.move_in_date ?? null,
      days_sober: matchingResident?.days_sober ?? null,
      bed_label: matchingResident?.bed_label ?? null,
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
      phone: r.phone,
      staffRole: null,
      isResident: true,
      residentId: r.id,
      userId: null,
      house_name: r.house_name,
      house_id: r.house_id,
      move_in_date: r.move_in_date,
      days_sober: r.days_sober,
      bed_label: r.bed_label,
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
            <div className="flex items-center gap-3 min-w-0">
              <AvatarInitials name={p.full_name} size="md" sobrietyDays={p.days_sober} />
              <div className="min-w-0">
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
                {p.phone && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); window.location.href = `tel:${p.phone}`; }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Phone className="h-3 w-3" />
                    {p.phone}
                  </button>
                )}
                <p className="text-xs text-muted-foreground truncate">
                  {p.house_name}
                  {p.bed_label && ` · ${p.bed_label}`}
                  {p.move_in_date && ` · Moved in ${formatDateOnly(p.move_in_date)}`}
                  {p.staffRole === "manager" && p.assigned_house_names.length > 0 && (
                    ` · Houses: ${p.assigned_house_names.join(", ")}`
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {p.days_sober !== null && (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getSobrietyBadgeClasses(p.days_sober)}`}>
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
      {/* Top-level section tabs: Residents | Intake | Applications | Archive */}
      {isStaff && (
        <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-xl border bg-muted/30 p-1 w-fit max-w-full">
          <button
            onClick={() => setTopTab("residents")}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              topTab === "residents"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Residents
          </button>
          {isAdmin && (
            <button
              onClick={() => setTopTab("intake")}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                topTab === "intake"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
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
            className={`px-4 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              topTab === "checkins"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Check Ins
          </button>
          {isAdmin && (
            <button
              onClick={() => setTopTab("applications")}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                topTab === "applications"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Applications
            </button>
          )}
          <button
            onClick={() => setTopTab("archive")}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              topTab === "archive"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Archive
            {(onLeavePeople.length + dischargedPeople.length) > 0 && (
              <Badge
                variant={topTab === "archive" ? "secondary" : "outline"}
                className="text-[10px] px-1.5 py-0"
              >
                {onLeavePeople.length + dischargedPeople.length}
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

      {/* Archive view — On Leave + Discharged with filter */}
      {topTab === "archive" && (
        <div className="space-y-4">
          <div className="flex gap-1 rounded-xl border bg-muted/30 p-1 w-fit">
            {([
              { key: "all" as const, label: "All" },
              { key: "on_leave" as const, label: "On Leave" },
              { key: "discharged" as const, label: "Discharged" },
            ]).map((f) => (
              <button
                key={f.key}
                onClick={() => setArchiveFilter(f.key)}
                className={`px-3 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  archiveFilter === f.key
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <StatusPeopleTabs
            tabs={tabs}
            people={
              archiveFilter === "on_leave"
                ? onLeavePeople
                : archiveFilter === "discharged"
                  ? dischargedPeople
                  : [...onLeavePeople, ...dischargedPeople]
            }
            filterByHouse={filterByHouse}
            renderPersonCard={renderPersonCard}
            emptyLabel={
              archiveFilter === "on_leave"
                ? "No residents currently on leave."
                : archiveFilter === "discharged"
                  ? "No discharged residents."
                  : "No archived residents."
            }
          />
        </div>
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
                          {new Date(user.createdAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })} ·
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
                        {isAdmin && (
                          <DeleteIntakeButton userId={user.id} userName={user.full_name} />
                        )}
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
                            {new Date(user.lastUpdatedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })}
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
                        {isAdmin && (
                          <DeleteIntakeButton userId={user.id} userName={user.full_name} />
                        )}
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
                      signatures={user.intakeSignatures}
                      staffSignedOffAt={user.staffSignedOffAt}
                      requireCommitment={requireCommitment}
                      facilityName={facilityName}
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
                        {user.commitment && !user.commitment.isAmendment && (
                          <>
                            <EditPendingCommitmentDialog
                              userId={user.id}
                              residentName={user.full_name}
                              current={{
                                paymentFrequency:
                                  user.commitment.paymentFrequency,
                                rentAmount: user.commitment.rentAmount,
                                adminFee: user.commitment.adminFee,
                                commitmentStartDate:
                                  user.commitment.commitmentStartDate,
                                commitmentTerm:
                                  user.commitment.commitmentTerm,
                                notes: user.commitment.notes,
                              }}
                            />
                            <ResendCommitmentButton
                              userId={user.id}
                              userName={user.full_name}
                            />
                          </>
                        )}
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
                        {isAdmin && (
                          <DeleteIntakeButton userId={user.id} userName={user.full_name} />
                        )}
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
                            {new Date(user.deniedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })}
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
                          <>
                            <ReopenButton
                              userId={user.id}
                              userName={user.full_name}
                            />
                            <DeleteIntakeButton userId={user.id} userName={user.full_name} />
                          </>
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
          <CheckInList batches={checkInBatches} facilityName={facilityName} />
        </div>
      )}

      {/* Applications view — admin can resend the full application to any active resident */}
      {topTab === "applications" && (
        <div className="space-y-4">
          {/* Resent applications pending admin review */}
          {resentApplications.filter((a) => a.status === "pending_review")
            .length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Pending Review
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Resent applications that have been completed by the resident
                  and are waiting for your sign-off.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {resentApplications
                    .filter((a) => a.status === "pending_review")
                    .map((a) => (
                      <div
                        key={a.userId}
                        className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{a.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.houseName ?? "No house"}
                            {a.completedAt &&
                              ` · Completed ${new Date(a.completedAt).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {a.intakeFormData && (
                            <ViewResentApplicationDialog
                              residentName={a.full_name}
                              formData={a.intakeFormData}
                              signatures={a.intakeSignatures ?? {}}
                            />
                          )}
                          <SignOffResendButton
                            userId={a.userId}
                            residentName={a.full_name}
                            formData={a.intakeFormData ?? {}}
                            signatures={a.intakeSignatures ?? {}}
                            facilityName={facilityName}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Resent applications awaiting completion by resident */}
          {resentApplications.filter((a) => a.status === "awaiting_completion")
            .length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Awaiting Completion
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Applications that have been resent but not yet completed by
                  the resident.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {resentApplications
                    .filter((a) => a.status === "awaiting_completion")
                    .map((a) => (
                      <div
                        key={a.userId}
                        className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{a.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.houseName ?? "No house"} · Waiting for resident
                            to complete
                          </p>
                        </div>
                        <Badge variant="outline">Sent</Badge>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Send/resend to any active resident */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Resend Application to Residents
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Send or resend the full intake application to an active
                resident. They will need to complete it before they can
                continue using the app.
                {!requireApplication && (
                  <span className="block mt-1 text-amber-600">
                    Note: The &quot;Require Application&quot; setting is
                    currently disabled in workspace settings. Residents sent
                    an application here will still be required to complete it.
                  </span>
                )}
              </p>
            </CardHeader>
            <CardContent>
              {activePeople.filter((p) => p.isResident && p.residentId).length === 0 ? (
                <div className="py-8 text-center">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">
                    No active residents to send applications to.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activePeople
                    .filter((p) => p.isResident && p.residentId)
                    .map((p) => (
                      <div
                        key={p.key}
                        className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{p.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.house_name}
                            {p.bed_label && ` · ${p.bed_label}`}
                            {p.move_in_date &&
                              ` · Moved in ${formatDateOnly(p.move_in_date)}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <ResendApplicationButton
                            residentId={p.residentId!}
                            residentName={p.full_name}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
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
