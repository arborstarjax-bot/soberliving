import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { IntakeReviewForm } from "./intake-review-form";
import { MarkCompleteButton } from "./mark-complete-button";
import { DenyButton } from "./deny-button";

type Tab = "pending" | "approved" | "denied";

const TABS: { value: Tab; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
];

function buildTabHref(tab: Tab): string {
  // Intake Review tabs don't share URL params with anything else yet
  // (no pagination, no search). Keeping the href shape simple here so
  // adding pagination later is just a matter of preserving ?page=.
  return `/intake-review?tab=${tab}`;
}

export default async function IntakeReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireRole("admin", "manager");
  const adminClient = createAdminClient();

  const params = await searchParams;
  const tab: Tab =
    params.tab === "approved" || params.tab === "denied"
      ? params.tab
      : "pending";

  // Fetch every user who submitted intake (across all three buckets) in
  // one query, plus their commitment state and intake form payload.
  // Partitioning happens in memory rather than three separate queries
  // because we want a consistent snapshot and the dataset is bounded
  // (one row per prospective resident).
  const [{ data: intakeUsersRaw }, { data: commitmentsRaw }, { data: housesRaw }] =
    await Promise.all([
      adminClient
        .from("users")
        .select(
          "id, full_name, email, phone, intake_completed, commitment_signed, is_resident, is_active, account_status, created_at"
        )
        .eq("intake_completed", true)
        .order("created_at", { ascending: false }),
      adminClient
        .from("house_commitments")
        .select("user_id, status, commitment_start_date, house_id"),
      adminClient
        .from("houses")
        .select("id, name, address")
        .eq("is_active", true)
        .order("name"),
    ]);

  const intakeUsers = intakeUsersRaw ?? [];
  const commitments = commitmentsRaw ?? [];
  const houses = housesRaw ?? [];
  const commitmentByUser = new Map(
    commitments.map((c) => [c.user_id, c])
  );
  const houseById = new Map(houses.map((h) => [h.id, h]));

  // Partition
  const pendingUsers = intakeUsers.filter(
    (u) =>
      (u.account_status ?? "active") !== "rejected" &&
      u.is_active !== false &&
      !commitmentByUser.has(u.id)
  );
  const approvedUsers = intakeUsers.filter(
    (u) =>
      (u.account_status ?? "active") !== "rejected" &&
      commitmentByUser.has(u.id)
  );
  const deniedUsers = intakeUsers.filter(
    (u) => u.account_status === "rejected"
  );

  const counts: Record<Tab, number> = {
    pending: pendingUsers.length,
    approved: approvedUsers.length,
    denied: deniedUsers.length,
  };

  // Only fetch intake-form payloads for the users we're about to render
  // to keep the page light.
  const visibleUsers =
    tab === "pending"
      ? pendingUsers
      : tab === "approved"
        ? approvedUsers
        : deniedUsers;

  const visibleIds = visibleUsers.map((u) => u.id);
  const { data: intakeForms } = await adminClient
    .from("intake_forms")
    .select("user_id, form_data, completed_at")
    .in("user_id", visibleIds.length > 0 ? visibleIds : ["none"])
    .eq("status", "completed");

  const intakeMap = new Map(
    (intakeForms ?? []).map((f) => [f.user_id, f])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Intake Review</h1>
        <p className="text-muted-foreground">
          Review submitted applications, assign housing, or deny.
        </p>
      </div>

      {/* URL-driven tab strip — matches Activity / Notifications style. */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/50 bg-muted/30 p-1">
        {TABS.map(({ value, label }) => {
          const isActive = value === tab;
          return (
            <Link
              key={value}
              href={buildTabHref(value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              )}
            >
              {label}
              <Badge variant={isActive ? "default" : "secondary"} className="ml-1">
                {counts[value]}
              </Badge>
            </Link>
          );
        })}
      </div>

      {visibleUsers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {tab === "pending" &&
                "No pending intake reviews. New applications will appear here when residents complete their intake form."}
              {tab === "approved" &&
                "No approved applications yet. Once you assign housing to a pending applicant they'll show here."}
              {tab === "denied" &&
                "No denied applications. Denied applicants are kept here for audit history."}
            </p>
          </CardContent>
        </Card>
      ) : tab === "pending" ? (
        // Pending: full review card with the existing assignment form
        visibleUsers.map((user) => {
          const intake = intakeMap.get(user.id);
          const fd = (intake?.form_data ?? {}) as Record<string, unknown>;
          return (
            <Card key={user.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{user.full_name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge>Application Complete</Badge>
                    <DenyButton userId={user.id} userName={user.full_name} />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {user.email} {user.phone ? `• ${user.phone}` : ""}
                  {intake?.completed_at
                    ? ` • Submitted ${new Date(intake.completed_at).toLocaleDateString()}`
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
                  houses={houses}
                />
              </CardContent>
            </Card>
          );
        })
      ) : tab === "approved" ? (
        // Approved: compact row showing commitment status. Still exposes
        // Mark Complete for the awaiting-signature case so staff can
        // finalize on behalf of the resident.
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {visibleUsers.map((user) => {
                const commit = commitmentByUser.get(user.id);
                const house = commit ? houseById.get(commit.house_id) : null;
                const awaitingSignature =
                  commit?.status === "pending_resident_signature";
                return (
                  <div
                    key={user.id}
                    className={cn(
                      "flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between",
                      awaitingSignature && "bg-yellow-50/60"
                    )}
                  >
                    <div>
                      <p className="font-medium">{user.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {user.email}
                        {house ? ` • ${house.name}` : ""}
                        {commit?.commitment_start_date
                          ? ` • Starts ${new Date(commit.commitment_start_date).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {awaitingSignature ? (
                        <>
                          <Badge
                            variant="outline"
                            className="border-yellow-400 text-yellow-700"
                          >
                            Awaiting Resident Signature
                          </Badge>
                          <MarkCompleteButton
                            userId={user.id}
                            userName={user.full_name}
                          />
                        </>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-emerald-400 text-emerald-700"
                        >
                          Active
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        // Denied: compact row with submitted date and a muted look. No
        // actions — denied is terminal; recovery is a DB-level fix.
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {visibleUsers.map((user) => {
                const intake = intakeMap.get(user.id);
                return (
                  <div
                    key={user.id}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between opacity-80"
                  >
                    <div>
                      <p className="font-medium">{user.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {user.email}
                        {intake?.completed_at
                          ? ` • Applied ${new Date(intake.completed_at).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    <Badge variant="destructive">Denied</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
