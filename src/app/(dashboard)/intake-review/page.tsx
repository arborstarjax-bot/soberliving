import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MarkCompleteButton } from "./mark-complete-button";
import { ReopenButton } from "./reopen-button";
import { ApplicationReview } from "./application-review";
import { EditPendingCommitmentDialog } from "./edit-pending-commitment-dialog";
import { ResendCommitmentButton } from "./resend-commitment-button";
import { formatDateOnly, getHouseToday } from "@/lib/timezone";

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
  // Intake review is admin-only. Managers handle operational intake
  // (in-person logistics, move-in day) but don't perform approve/deny
  // or housing assignment on the platform.
  const currentUser = await requireRole("admin");
  const isAdmin = currentUser.role === "admin";
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
          "id, full_name, email, phone, intake_completed, commitment_signed, is_resident, is_active, account_status, denial_reason, denied_at, created_at"
        )
        .eq("intake_completed", true)
        .order("created_at", { ascending: false }),
      adminClient
        .from("house_commitments")
        .select(
          "user_id, status, commitment_start_date, house_id, payment_frequency, rent_amount, admin_fee, commitment_term, notes, parent_commitment_id"
        ),
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
        // Pending: PDF-style review first; admin clicks Approve & Assign
        // to reveal the housing/rent config form, or Deny (reason dialog).
        visibleUsers.map((user) => {
          const intake = intakeMap.get(user.id);
          const fd = (intake?.form_data ?? {}) as Record<string, unknown>;
          return (
            <Card key={user.id}>
              <CardContent className="pt-6">
                <ApplicationReview
                  userId={user.id}
                  userName={user.full_name}
                  email={user.email}
                  phone={user.phone}
                  submittedAt={intake?.completed_at ?? null}
                  houses={houses}
                  isAdmin={isAdmin}
                  formData={fd}
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
                          ? ` • Starts ${formatDateOnly(commit.commitment_start_date)}`
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
                          {commit && !commit.parent_commitment_id && (
                            <>
                              <EditPendingCommitmentDialog
                                userId={user.id}
                                residentName={user.full_name}
                                current={{
                                  paymentFrequency:
                                    (commit.payment_frequency as
                                      | "weekly"
                                      | "monthly") ?? "monthly",
                                  rentAmount: Number(commit.rent_amount ?? 0),
                                  adminFee: Number(commit.admin_fee ?? 0),
                                  commitmentStartDate:
                                    (commit.commitment_start_date as string) ??
                                    getHouseToday(),
                                  commitmentTerm:
                                    (commit.commitment_term as string) ??
                                    "181 days",
                                  notes:
                                    (commit.notes as string | null) ?? null,
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
                const u = user as typeof user & {
                  denial_reason?: string | null;
                  denied_at?: string | null;
                };
                return (
                  <div
                    key={user.id}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{user.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {user.email}
                        {intake?.completed_at
                          ? ` • Applied ${new Date(intake.completed_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })}`
                          : ""}
                        {u.denied_at
                          ? ` • Denied ${new Date(u.denied_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })}`
                          : ""}
                      </p>
                      {u.denial_reason?.trim() && (
                        <p className="mt-2 rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Reason:</span>{" "}
                          {u.denial_reason}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">Denied</Badge>
                      {isAdmin && (
                        <ReopenButton userId={user.id} userName={user.full_name} />
                      )}
                    </div>
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
