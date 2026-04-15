import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IntakeReviewForm } from "./intake-review-form";

export default async function IntakeReviewPage() {
  await requireRole("admin", "manager");
  const adminClient = createAdminClient();

  // Get users who completed intake but don't have an active/pending commitment
  const { data: users } = await adminClient
    .from("users")
    .select("id, full_name, email, phone, intake_completed, commitment_signed, is_resident, created_at")
    .eq("intake_completed", true)
    .eq("commitment_signed", false)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  // Filter out users who already have a house_commitment (pending_resident_signature or active)
  const userIds = (users ?? []).map((u) => u.id);
  const { data: existingCommitments } = await adminClient
    .from("house_commitments")
    .select("user_id, status")
    .in("user_id", userIds.length > 0 ? userIds : ["none"]);

  const usersWithCommitments = new Set(
    (existingCommitments ?? []).map((c) => c.user_id)
  );

  // Pending = completed intake, no commitment yet
  const pendingUsers = (users ?? []).filter((u) => !usersWithCommitments.has(u.id));
  // Awaiting resident signature = commitment exists with pending_resident_signature
  const awaitingSignature = (existingCommitments ?? [])
    .filter((c) => c.status === "pending_resident_signature")
    .map((c) => c.user_id);
  const awaitingUsers = (users ?? []).filter((u) => awaitingSignature.includes(u.id));

  // Get intake form data for pending users
  const pendingIds = pendingUsers.map((u) => u.id);
  const { data: intakeForms } = await adminClient
    .from("intake_forms")
    .select("user_id, form_data, completed_at")
    .in("user_id", pendingIds.length > 0 ? pendingIds : ["none"])
    .eq("status", "completed");

  const intakeMap = new Map(
    (intakeForms ?? []).map((f) => [f.user_id, f])
  );

  // Get houses with rooms and beds for assignment
  const { data: houses } = await adminClient
    .from("houses")
    .select("id, name, address")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Intake Review</h1>
        <p className="text-muted-foreground">
          Review completed applications and assign housing for new residents
        </p>
      </div>

      {/* Awaiting Resident Signature */}
      {awaitingUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Awaiting Resident Signature
              <Badge variant="secondary">{awaitingUsers.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {awaitingUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-yellow-50"
                >
                  <div>
                    <p className="font-medium">{user.full_name}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <Badge variant="outline" className="text-yellow-700 border-yellow-400">
                    Pending Resident Signature
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Intake Reviews */}
      {pendingUsers.length === 0 && awaitingUsers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No pending intake reviews. New applications will appear here when residents complete their intake form.
            </p>
          </CardContent>
        </Card>
      ) : (
        pendingUsers.map((user) => {
          const intake = intakeMap.get(user.id);
          const fd = (intake?.form_data ?? {}) as Record<string, unknown>;
          return (
            <Card key={user.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{user.full_name}</CardTitle>
                  <Badge>Application Complete</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {user.email} {user.phone ? `• ${user.phone}` : ""}
                  {intake?.completed_at
                    ? ` • Completed ${new Date(intake.completed_at).toLocaleDateString()}`
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
                  houses={houses ?? []}
                />
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
