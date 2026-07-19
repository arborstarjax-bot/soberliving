import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { canAccessHouse } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getHouseToday } from "@/lib/timezone";
import { NewAssessmentForm } from "../new-assessment-form";

export default async function NewSafetyAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuth();

  if (user.role !== "admin" && user.role !== "manager") {
    redirect(`/houses/${id}`);
  }
  if (user.role === "manager" && !canAccessHouse(user, id)) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();
  const { data: house } = await admin
    .from("houses")
    .select("id, name, timezone")
    .eq("id", id)
    .maybeSingle();

  if (!house) redirect("/houses");

  const tz =
    (house as { timezone?: string | null }).timezone || undefined;
  const todayIso = getHouseToday(tz);

  return (
    <div className="container max-w-3xl py-6">
      <NewAssessmentForm
        houseId={id}
        houseName={(house.name as string) ?? ""}
        todayIso={todayIso}
        defaultPersonName={user.full_name ?? ""}
      />
    </div>
  );
}
