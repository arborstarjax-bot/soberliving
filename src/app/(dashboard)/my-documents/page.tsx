import { requireAuth } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { MyDocumentsView } from "./my-documents-view";

// Resident-only documents library. Staff already see the same content
// through the Documents tab on the resident profile; this page gives
// residents a top-level nav entry to get at their application, signed
// commitment, and receipts without having to dig.

const TYPE_LABELS: Record<string, string> = {
  intake_packet: "Application",
  house_commitment: "House Commitment",
  payment_receipt: "Payment Receipts",
  check_in: "Check-In Documents",
  other: "Other Documents",
};

const TYPE_ORDER = [
  "intake_packet",
  "house_commitment",
  "payment_receipt",
  "check_in",
];

interface DocRow {
  id: string;
  name: string;
  document_type: string;
  storage_path: string;
  file_size: number | null;
  created_at: string;
}

export default async function MyDocumentsPage() {
  const user = await requireAuth();
  if (user.role !== "resident") {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("documents")
    .select("id, name, document_type, storage_path, file_size, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const typed: DocRow[] = (docs ?? []) as DocRow[];
  const grouped = new Map<string, DocRow[]>();
  for (const d of typed) {
    const key = TYPE_ORDER.includes(d.document_type) ? d.document_type : "other";
    const list = grouped.get(key) ?? [];
    list.push(d);
    grouped.set(key, list);
  }

  const groups = [...TYPE_ORDER, "other"]
    .filter((k) => (grouped.get(k)?.length ?? 0) > 0)
    .map((k) => ({
      key: k,
      label: TYPE_LABELS[k] ?? "Documents",
      docs: grouped.get(k) ?? [],
    }));

  // Pre-sign every document's storage URL at render time so the client
  // component can render real <a href=...> tags. This is critical for
  // mobile Safari, which blocks `window.open` that's called after a
  // server action awaits (the user-gesture window has closed by then).
  // We parallelize the signings and fall back to a null URL if any one
  // fails so the rest of the page still renders.
  const adminClient = createAdminClient();
  const signedUrls: Record<string, string> = {};
  await Promise.all(
    typed.map(async (d) => {
      const { data } = await adminClient.storage
        .from("documents")
        .createSignedUrl(d.storage_path, 3600);
      if (data?.signedUrl) signedUrls[d.id] = data.signedUrl;
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Documents</h1>
        <p className="text-sm text-muted-foreground">
          Your application, signed house commitment, payment receipts, and
          other documents we&apos;ve saved for you.
        </p>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No documents saved yet. Receipts and signed agreements will
            appear here automatically.
          </CardContent>
        </Card>
      ) : (
        <MyDocumentsView groups={groups} signedUrls={signedUrls} />
      )}
    </div>
  );
}
