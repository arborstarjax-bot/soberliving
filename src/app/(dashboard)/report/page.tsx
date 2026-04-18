import { requireAuth } from "@/lib/auth";
import { NewGrievanceForm } from "./new-grievance-form";

export default async function ReportPage() {
  // Any signed-in user can file a report. Staff rarely will, but we
  // don't gate on role — if an admin wants to test the flow or file
  // on behalf of an observed issue, that's fine.
  await requireAuth();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Report</h1>
        <p className="text-sm text-muted-foreground">
          File a grievance or report a problem. Check
          &quot;Submit anonymously&quot; to send the report without your
          name or house attached.
        </p>
      </div>
      <NewGrievanceForm />
    </div>
  );
}
