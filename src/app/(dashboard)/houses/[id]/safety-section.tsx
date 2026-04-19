import { createAdminClient, createClient } from "@/lib/supabase/server";
import { SafetyList, type SafetyAssessmentRow } from "./safety/safety-list";
import type { SafetyChecklistResponses } from "@/lib/safety-checklist";
import { getHouseFirstOfMonth } from "@/lib/timezone";

/**
 * Safety tab body — safety_assessments + linked house_documents
 * signed URLs. Only mounted when `tab=safety` so the 50-row
 * join + signed-URL batch doesn't run for any other tab view.
 */
export async function SafetySection({
  houseId,
  canManage,
  houseTimezone,
}: {
  houseId: string;
  canManage: boolean;
  houseTimezone: string | undefined;
}) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: safetyAssessmentsRaw } = await supabase
    .from("safety_assessments")
    .select(
      "id, assessment_date, person_completing_name, created_at, document_id, checklist, completer:users!completed_by(full_name)"
    )
    .eq("house_id", houseId)
    .order("assessment_date", { ascending: false })
    .limit(50);

  const safetyRawTyped = (safetyAssessmentsRaw ?? []) as Array<{
    id: string;
    assessment_date: string;
    person_completing_name: string;
    created_at: string;
    document_id: string | null;
    checklist: SafetyChecklistResponses | null;
    completer: { full_name: string } | { full_name: string }[] | null;
  }>;

  const safetyAssessments: SafetyAssessmentRow[] = safetyRawTyped.map((r) => {
    const completer = Array.isArray(r.completer)
      ? r.completer[0] ?? null
      : r.completer;
    return {
      id: r.id,
      assessment_date: r.assessment_date,
      person_completing_name: r.person_completing_name,
      created_at: r.created_at,
      document_id: r.document_id,
      checklist: (r.checklist ?? {}) as SafetyChecklistResponses,
      completed_by_name: completer?.full_name ?? null,
    };
  });

  const safetyDocumentIds = safetyAssessments
    .map((a) => a.document_id)
    .filter((id): id is string => Boolean(id));
  const safetyDocumentUrls: Record<string, string> = {};
  if (safetyDocumentIds.length > 0) {
    const { data: safetyDocs } = await adminClient
      .from("house_documents")
      .select("id, file_path")
      .in("id", safetyDocumentIds);
    await Promise.all(
      (safetyDocs ?? []).map(async (d) => {
        const { data } = await adminClient.storage
          .from("house-documents")
          .createSignedUrl(d.file_path as string, 3600);
        if (data?.signedUrl) {
          safetyDocumentUrls[d.id as string] = data.signedUrl;
        }
      })
    );
  }

  const firstOfMonth = getHouseFirstOfMonth(houseTimezone);
  const latestAssessmentThisMonth = safetyAssessments.some(
    (a) => a.assessment_date >= firstOfMonth
  );

  return (
    <SafetyList
      houseId={houseId}
      canManage={canManage}
      assessments={safetyAssessments}
      documentUrls={safetyDocumentUrls}
      latestThisMonth={latestAssessmentThisMonth}
    />
  );
}
