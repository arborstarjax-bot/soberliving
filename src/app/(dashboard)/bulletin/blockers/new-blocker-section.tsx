import { createAdminClient } from "@/lib/supabase/server";
import { getCachedActiveHouses } from "@/lib/cached-dropdowns";
import type { SessionUser } from "@/lib/types";
import { NewBlockerForm } from "./new-blocker-form";

/**
 * Small data fetch just for the "New Notice" composer card — houses
 * + residents the current staff user is allowed to target. Lives in
 * its own `<Suspense>` island so the page header paints immediately
 * and the form appears as soon as these small queries resolve.
 */
export async function NewBlockerSection({ user }: { user: SessionUser }) {
  const admin = createAdminClient();

  let residentsQuery = admin
    .from("residents")
    .select(
      "user_id, house_id, user:users!inner(id, full_name), house:houses!inner(id, name)"
    )
    .eq("status", "active");
  if (user.role === "manager") {
    residentsQuery = residentsQuery.in("house_id", user.assigned_house_ids);
  }

  const [allHouses, { data: residentRows }] = await Promise.all([
    getCachedActiveHouses(),
    residentsQuery,
  ]);

  const houses =
    user.role === "manager"
      ? allHouses.filter((h) => user.assigned_house_ids.includes(h.id))
      : allHouses;

  const residents = (residentRows ?? [])
    .map((r) => {
      const u = r.user as unknown as { id: string; full_name: string };
      const h = r.house as unknown as { id: string; name: string };
      return u && h
        ? {
            user_id: u.id,
            full_name: u.full_name,
            house_id: h.id,
            house_name: h.name,
          }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <NewBlockerForm
      houses={houses ?? []}
      residents={residents}
      userRole={user.role}
    />
  );
}
