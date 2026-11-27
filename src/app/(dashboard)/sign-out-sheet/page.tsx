import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Legacy route — redirects to the unified Attendance page.
 * Preserves the ?tab= param so bookmarks to "past_curfew" still work.
 */
export default async function SignOutSheetPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) || "currently_out";
  const target = tab === "past_curfew" ? "/attendance?tab=past_curfew" : "/attendance?tab=currently_out";
  redirect(target);
}
