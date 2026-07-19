import { redirect } from "next/navigation";

/**
 * Legacy route — redirects to the unified Attendance page (Overnight tab).
 */
export default async function LeaveRequestsPage() {
  redirect("/attendance?tab=overnight");
}
