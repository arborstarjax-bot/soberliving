import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { CheckInForm } from "./checkin-form";

export default async function CheckInPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const user = await requireAuth();
  const adminClient = createAdminClient();

  // Load the check-in response
  const { data: response } = await adminClient
    .from("check_in_responses")
    .select("id, user_id, resident_id, house_id, status, form_data, created_at")
    .eq("id", id)
    .single();

  if (!response) {
    redirect("/dashboard");
  }

  // Must be the owner
  if (response.user_id !== user.id) {
    redirect("/dashboard");
  }

  // Already completed
  if (response.status !== "pending") {
    redirect("/dashboard");
  }

  // Get resident + house info for prefill
  const { data: resident } = await adminClient
    .from("residents")
    .select("full_name, house_id, houses(name)")
    .eq("id", response.resident_id)
    .single();

  const residentName = resident?.full_name ?? user.full_name;
  const houseName = (resident?.houses as unknown as { name: string } | null)?.name ?? "";

  return (
    <CheckInForm
      responseId={response.id}
      residentName={residentName}
      houseName={houseName}
      initialData={response.form_data as Record<string, string> | null}
    />
  );
}
