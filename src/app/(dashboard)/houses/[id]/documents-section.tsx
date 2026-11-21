import { createAdminClient, createClient } from "@/lib/supabase/server";
import { DocumentsList, type HouseDocument } from "./documents-list";

/**
 * Documents tab body — house_documents + pre-signed storage URLs.
 * The signed URLs are batched via `Promise.all` so Open/Download
 * renders as a real anchor tag (avoids the mobile-Safari user-
 * gesture issue on click-then-await-then-window.open). Only
 * mounted when `tab=documents`.
 */
export async function DocumentsSection({
  houseId,
  canManage,
}: {
  houseId: string;
  canManage: boolean;
}) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: documents } = await supabase
    .from("house_documents")
    .select(
      "id, name, description, file_path, mime_type, size_bytes, created_at, uploader:users!uploaded_by(full_name)"
    )
    .eq("house_id", houseId)
    .order("created_at", { ascending: false });

  const houseDocuments: HouseDocument[] = ((documents ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
    file_path: string;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
    uploader: { full_name: string } | { full_name: string }[] | null;
  }>).map((d) => {
    const uploader = Array.isArray(d.uploader)
      ? d.uploader[0] ?? null
      : d.uploader;
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      file_path: d.file_path,
      mime_type: d.mime_type,
      size_bytes: d.size_bytes,
      created_at: d.created_at,
      uploader_name: uploader?.full_name ?? null,
    };
  });

  const houseDocumentUrls: Record<string, string> = {};
  await Promise.all(
    houseDocuments.map(async (d) => {
      const { data } = await adminClient.storage
        .from("house-documents")
        .createSignedUrl(d.file_path, 3600);
      if (data?.signedUrl) houseDocumentUrls[d.id] = data.signedUrl;
    })
  );

  return (
    <DocumentsList
      houseId={houseId}
      documents={houseDocuments}
      canManage={canManage}
      signedUrls={houseDocumentUrls}
    />
  );
}
