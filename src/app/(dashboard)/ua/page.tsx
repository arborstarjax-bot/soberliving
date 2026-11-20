import { requireAuth } from "@/lib/auth";
import { isModuleVisibleToRole } from "@/lib/modules";
import { getWorkspaceSettings } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { UaView } from "./ua-view";

export const dynamic = "force-dynamic";

export default async function UaPage() {
  const user = await requireAuth();
  if (user.role !== "admin") redirect("/dashboard");
  const wsSettings = await getWorkspaceSettings(user.workspace_id ?? "");
  if (!isModuleVisibleToRole(wsSettings, "ua", user.role))
    redirect("/dashboard");

  const admin = createAdminClient();
  const [{ data: houses }, { data: residents }, { data: tests }] =
    await Promise.all([
    admin
      .from("houses")
      .select("id, name")
      .eq("workspace_id", user.workspace_id)
      .order("name"),
    admin
      .from("residents")
      .select("id, full_name, house_id")
      .in("house_id", (await admin.from("houses").select("id").eq("workspace_id", user.workspace_id)).data?.map((h) => h.id) ?? [])
      .eq("status", "active")
      .order("full_name"),
    admin
      .from("ua_tests")
      .select(
        "id, house_id, count, reason, status, created_at, house:houses(name), ua_results(id, resident_id, result, photo_path, resident:residents(full_name))"
      )
      .eq("workspace_id", user.workspace_id)
      .order("created_at", { ascending: false })
      .limit(50),
    ]);

  const residentsByHouse: Record<string, { id: string; full_name: string }[]> =
    {};
  for (const r of residents ?? []) {
    if (!residentsByHouse[r.house_id]) residentsByHouse[r.house_id] = [];
    residentsByHouse[r.house_id].push({
      id: r.id,
      full_name: r.full_name,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">UA Randomizer</h1>
        <p className="text-muted-foreground">
          Draw random residents for urinalysis, record pass/fail, archive
          or print the sheet.
        </p>
      </div>
      <UaView
        houses={houses ?? []}
        residentsByHouse={residentsByHouse}
        tests={
          (tests ?? []).map((t) => ({
            ...t,
            house: Array.isArray(t.house) ? t.house[0] ?? null : t.house,
            ua_results: (t.ua_results ?? []).map((r) => ({
              ...r,
              resident: Array.isArray(r.resident)
                ? r.resident[0] ?? null
                : r.resident,
            })),
          })) as never
        }
      />
    </div>
  );
}
