import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateLeaveRequestDialog } from "./create-leave-request-dialog";
import { LeaveReviewActions } from "./leave-review-actions";

export default async function LeaveRequestsPage() {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  let query = supabase
    .from("leave_requests")
    .select("*, resident:residents(id, full_name, house_id, houses(name))")
    .order("created_at", { ascending: false });

  if (user.role === "resident") {
    const { data: resident } = await supabase
      .from("residents")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();
    if (resident) {
      query = query.eq("resident_id", resident.id);
    }
  }

  const { data: allRequests } = await query;

  let requests = allRequests ?? [];
  if (houseFilter && user.role !== "resident") {
    requests = requests.filter((r) =>
      houseFilter.includes(
        (r.resident as { house_id: string })?.house_id
      )
    );
  }

  const pending = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");
  const others = requests.filter(
    (r) => r.status === "denied" || r.status === "returned"
  );

  // Get residents for the create dialog
  let residentsQuery = supabase
    .from("residents")
    .select("id, full_name, house_id")
    .eq("status", "active")
    .order("full_name");
  if (houseFilter) residentsQuery = residentsQuery.in("house_id", houseFilter);
  const { data: residents } = await residentsQuery;

  const isStaff = user.role === "admin" || user.role === "manager";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leave Requests</h1>
          <p className="text-muted-foreground">
            {pending.length} pending
          </p>
        </div>
        <CreateLeaveRequestDialog
          residents={residents ?? []}
          userRole={user.role}
          userId={user.id}
        />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved ({approved.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            History ({others.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pending.length > 0 ? (
            <div className="space-y-2">
              {pending.map((lr) => (
                <Card key={lr.id}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">
                        {(lr.resident as unknown as { full_name: string } | null)?.full_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(lr.departure_date).toLocaleDateString()} →{" "}
                        {new Date(lr.expected_return_date).toLocaleDateString()}
                      </p>
                      {lr.reason && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {lr.reason}
                        </p>
                      )}
                    </div>
                    {isStaff && <LeaveReviewActions requestId={lr.id} status="pending" />}
                  </CardContent>
                </Card>
              ))}
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
              {approved.map((lr) => (
                <Card key={lr.id}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">
                        {(lr.resident as unknown as { full_name: string } | null)?.full_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(lr.departure_date).toLocaleDateString()} →{" "}
                        {new Date(lr.expected_return_date).toLocaleDateString()}
                      </p>
                    </div>
                    {isStaff && (
                      <LeaveReviewActions requestId={lr.id} status="approved" />
                    )}
                  </CardContent>
                </Card>
              ))}
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
              {others.map((lr) => (
                <Card key={lr.id}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">
                        {(lr.resident as unknown as { full_name: string } | null)?.full_name}
                      </p>
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
                      variant={lr.status === "denied" ? "destructive" : "secondary"}
                      className="capitalize"
                    >
                      {lr.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
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
