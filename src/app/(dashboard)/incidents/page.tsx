import { redirect } from "next/navigation";

/**
 * Legacy route — incidents now live as a tab inside the Discipline page.
 */
export default async function IncidentsPage() {
  redirect("/discipline");
}
