import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceSettings } from "@/lib/workspace";
import { isModuleEnabled } from "@/lib/modules";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { MeetingsView } from "./meetings-view";
import { LogMeetingForm } from "./log-meeting-form";

interface MeetingRow {
  id: string;
  resident_id: string;
  meeting_name: string;
  location: string;
  meeting_at: string;
  facilitator_name: string | null;
  facilitator_signature: string;
  photo_path: string | null;
  resident?: { full_name?: string } | { full_name?: string }[] | null;
  house?: { name?: string } | { name?: string }[] | null;
}

/**
 * Meetings — residents log outside meetings (AA/NA/etc.) with a
 * facilitator signature; staff see the weekly calendar per resident.
 * Photo uploads are enforced when the workspace has
 * require_meeting_photo on.
 */
export default async function MeetingsPage() {
  const user = await requireAuth();
  const wsSettings = user.workspace_id
    ? await getWorkspaceSettings(user.workspace_id)
    : null;
  if (!isModuleEnabled(wsSettings, "meetings")) redirect("/dashboard");

  const isStaff = user.role === "admin" || user.role === "manager";
  const supabase = await createClient();

  if (!isStaff) {
    const { data: resident } = await supabase
      .from("residents")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const { data: meetings } = resident
      ? await supabase
          .from("meetings")
          .select(
            "id, resident_id, meeting_name, location, meeting_at, facilitator_name, facilitator_signature, photo_path"
          )
          .eq("resident_id", resident.id)
          .order("meeting_at", { ascending: false })
          .limit(200)
      : { data: [] };

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Meetings</h1>
          <p className="text-sm text-muted-foreground">
            Log your meetings and have the facilitator sign off.
          </p>
        </div>
        <LogMeetingForm
          photoRequired={wsSettings?.require_meeting_photo === true}
        />
        <MeetingsView meetings={(meetings ?? []) as MeetingRow[]} showResident={false} />
      </div>
    );
  }

  const houseFilter = getAccessibleHouseFilter(user);
  let query = supabase
    .from("meetings")
    .select(
      "id, resident_id, meeting_name, location, meeting_at, facilitator_name, facilitator_signature, photo_path, resident:residents(full_name), house:houses(name)"
    )
    .order("meeting_at", { ascending: false })
    .limit(500);
  if (houseFilter) query = query.in("house_id", houseFilter);
  const { data: meetings } = await query;

  let residentsQuery = supabase
    .from("residents")
    .select("id, full_name, house_id")
    .eq("status", "active")
    .order("full_name");
  if (houseFilter) residentsQuery = residentsQuery.in("house_id", houseFilter);
  const { data: residents } = await residentsQuery;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meetings</h1>
        <p className="text-sm text-muted-foreground">
          Facilitator-signed meeting logs, grouped by week and resident.
        </p>
      </div>
      <MeetingsView
        meetings={(meetings ?? []) as MeetingRow[]}
        residents={
          (residents ?? []) as { id: string; full_name: string; house_id: string }[]
        }
        showResident
        isAdmin={user.role === "admin"}
      />
    </div>
  );
}
