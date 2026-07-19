import { redirect } from "next/navigation";

/**
 * Legacy route — Report is now accessible from the Community Services
 * (bulletin) page. Redirect so old bookmarks still work.
 */
export default async function ReportPage() {
  redirect("/bulletin?report=1");
}
