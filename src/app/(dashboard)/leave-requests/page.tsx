import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateLeaveRequestDialog } from "./create-leave-request-dialog";
import { LeaveReviewActions } from "./leave-review-actions";

function statusLabel(status: string) {
  switch (status) {
    case "pending_cover": return "Pending Cover Approval";
    case "pending_manager": return "Pending Manager Approval";
    case "pending_admin": return "Pending Admin Approval";
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    case "returned": return "Returned";
    default: return status;
  }
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "approved": return "default";
    case "rejected": return "destructive";
    case "returned": return "secondary";
    default: return "outline";
  }
}

export default async function LeaveRequestsPage() {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  // Get user's resident ID if they are a resident
  let userResidentId: string | undefined;
  if (user.role === "resident" || user.is_resident) {
    const { data: myResident } = await supabase
      .from("residents")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();
    userResidentId = myResident?.id;
  }

  // Leave requests and the residents list (for the create dialog) are
  // independent of one another once we know the viewer's resident id.
  // Build both queries and fire them in a single Promise.all.
  let query = supabase
    .from("leave_requests")
    .select("*, resident:residents!leave_requests_resident_id_fkey(id, full_name, house_id, user_id), covering_resident:residents!leave_requests_covering_resident_id_fkey(id, full_name, user_id)")
    .order("created_at", { ascending: false });

  if (user.role === "resident") {
    if (userResidentId) {
      query = query.or(`resident_id.eq.${userResidentId},covering_resident_id.eq.${userResidentId}`);
    }
  }

  let residentsQuery = supabase
    .from("residents")
    .select("id, full_name, house_id")
    .eq("status", "active")
    .order("full_name");
  if (houseFilter) residentsQuery = residentsQuery.in("house_id", houseFilter);

  const [
    { data: allRequests },
    { data: residents },
  ] = await Promise.all([query, residentsQuery]);

  let requests = allRequests ?? [];
  if (houseFilter && user.role !== "resident") {
    requests = requests.filter((r) => {
      const resident = r.resident as unknown as { house_id: string } | null;
      return resident ? houseFilter.includes(resident.house_id) : false;
    });
  }

  const pendingAll = requests.filter((r) =>
    r.status === "pending_cover" || r.status === "pending_manager" || r.status === "pending_admin"
  );
  const approved = requests.filter((r) => r.status === "approved");
  const others = requests.filter(
    (r) => r.status === "rejected" || r.status === "returned"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leave Requests</h1>
          <p className="text-muted-foreground">
            {pendingAll.length} pending · Multi-step approval
          </p>
        </div>
        <CreateLeaveRequestDialog
          residents={residents ?? []}
          userRole={user.role}
          userId={user.id}
          userResidentId={userResidentId}
        />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {pendingAll.length > 0 && (
              <Badge
                variant="default"
                className="ml-1.5 text-[10px] px-1.5 py-0"
              >
                {pendingAll.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved
            {approved.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1.5 text-[10px] px-1.5 py-0"
              >
                {approved.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            History
            {others.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1.5 text-[10px] px-1.5 py-0"
              >
                {others.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pendingAll.length > 0 ? (
            <div className="space-y-3">
              {pendingAll.map((lr) => {
                const resident = lr.resident as unknown as { full_name: string; house_id: string; user_id: string | null } | null;
                const coverResident = lr.covering_resident as unknown as { full_name: string; user_id: string | null } | null;
                return (
                  <Card key={lr.id}>
                    <CardContent className="py-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{resident?.full_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(lr.departure_date).toLocaleDateString()} →{" "}
                            {new Date(lr.expected_return_date).toLocaleDateString()}
                          </p>
                          {lr.reason_for_pass && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Reason: {lr.reason_for_pass}
                            </p>
                          )}
                          {coverResident && (
                            <p className="text-xs text-muted-foreground">
                              Cover: {coverResident.full_name}
                            </p>
                          )}
                        </div>
                        <Badge variant={statusVariant(lr.status)} className="text-xs capitalize whitespace-nowrap">
                          {statusLabel(lr.status)}
                        </Badge>
                      </div>

                      {/* Approval timeline */}
                      <div className="flex items-center gap-1 text-xs">
                        <StepIndicator
                          label="Cover"
                          done={!!lr.cover_approved_at}
                          active={lr.status === "pending_cover"}
                          rejected={lr.status === "rejected" && lr.rejection_step === "cover"}
                        />
                        <span className="text-muted-foreground">→</span>
                        <StepIndicator
                          label="Manager"
                          done={!!lr.house_manager_approved_at}
                          active={lr.status === "pending_manager"}
                          rejected={lr.status === "rejected" && lr.rejection_step === "manager"}
                        />
                        <span className="text-muted-foreground">→</span>
                        <StepIndicator
                          label="Admin"
                          done={!!lr.admin_approved_at}
                          active={lr.status === "pending_admin"}
                          rejected={lr.status === "rejected" && lr.rejection_step === "admin"}
                        />
                      </div>

                      <LeaveReviewActions
                        requestId={lr.id}
                        status={lr.status}
                        userRole={user.role}
                        userId={user.id}
                        coveringResidentUserId={coverResident?.user_id}
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center">
              No pending requests
            </p>
          )}
        </TabsContent>

        <TabsContent value="approved" className="mt-4">
          {approved.length > 0 ? (
            <div className="space-y-2">
              {approved.map((lr) => {
                const resident = lr.resident as unknown as { full_name: string } | null;
                return (
                  <Card key={lr.id}>
                    <CardContent className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium">{resident?.full_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(lr.departure_date).toLocaleDateString()} →{" "}
                          {new Date(lr.expected_return_date).toLocaleDateString()}
                        </p>
                      </div>
                      <LeaveReviewActions
                        requestId={lr.id}
                        status={lr.status}
                        userRole={user.role}
                        userId={user.id}
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center">
              No approved requests
            </p>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {others.length > 0 ? (
            <div className="space-y-2">
              {others.map((lr) => {
                const resident = lr.resident as unknown as { full_name: string } | null;
                return (
                  <Card key={lr.id}>
                    <CardContent className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium">{resident?.full_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(lr.departure_date).toLocaleDateString()} →{" "}
                          {new Date(lr.expected_return_date).toLocaleDateString()}
                        </p>
                        {lr.denial_note && (
                          <p className="text-xs text-destructive mt-1">
                            {lr.denial_note}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={statusVariant(lr.status)}
                        className="capitalize"
                      >
                        {statusLabel(lr.status)}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center">
              No history
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StepIndicator({
  label,
  done,
  active,
  rejected,
}: {
  label: string;
  done: boolean;
  active: boolean;
  rejected: boolean;
}) {
  if (rejected) {
    return (
      <span className="px-2 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
        {label} ✕
      </span>
    );
  }
  if (done) {
    return (
      <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">
        {label} ✓
      </span>
    );
  }
  if (active) {
    return (
      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-medium animate-pulse">
        {label}
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground">
      {label}
    </span>
  );
}
