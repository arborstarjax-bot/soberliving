import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { canAccessHouse } from "@/lib/permissions";
import { formatDateOnly } from "@/lib/timezone";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "./print-button";

type PassRow = {
  id: string;
  status: string;
  leaving_datetime: string | null;
  returning_datetime: string | null;
  departure_date: string | null;
  expected_return_date: string | null;
  reason: string | null;
  reason_for_pass: string | null;
  transportation: string | null;
  companion: string | null;
  destination_address: string | null;
  denial_note: string | null;
  cover_approved_at: string | null;
  house_manager_approved_at: string | null;
  admin_approved_at: string | null;
  created_at: string | null;
  resident: {
    full_name: string;
    house_id: string;
    user_id: string | null;
  } | null;
  covering_resident: { full_name: string; user_id: string | null } | null;
};

const STATUS_BANNER: Record<string, { label: string; cls: string }> = {
  pending_cover: { label: "PENDING — AWAITING COVER", cls: "border-amber-500 text-amber-700" },
  pending_manager: { label: "PENDING — AWAITING MANAGER", cls: "border-amber-500 text-amber-700" },
  pending_admin: { label: "PENDING — AWAITING ADMIN", cls: "border-amber-500 text-amber-700" },
  approved: { label: "APPROVED", cls: "border-green-600 text-green-700" },
  rejected: { label: "DENIED", cls: "border-red-600 text-red-700" },
  returned: { label: "RETURNED", cls: "border-gray-500 text-gray-600" },
};

export default async function PrintPassPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuth();
  const admin = createAdminClient();

  const { data: raw } = await admin
    .from("leave_requests")
    .select(
      "*, resident:residents!leave_requests_resident_id_fkey(full_name, house_id, user_id), covering_resident:residents!leave_requests_covering_resident_id_fkey(full_name, user_id)"
    )
    .eq("id", id)
    .maybeSingle();

  const pass = raw as unknown as PassRow | null;
  if (!pass || !pass.resident) notFound();

  const residentUserId = pass.resident.user_id;
  const coverUserId = pass.covering_resident?.user_id;
  const isStaff =
    user.role === "admin" || canAccessHouse(user, pass.resident.house_id);
  const isInvolvedResident =
    user.id === residentUserId || user.id === coverUserId;
  if (!isStaff && !isInvolvedResident) redirect("/passes");

  const { data: house } = await admin
    .from("houses")
    .select("name")
    .eq("id", pass.resident.house_id)
    .maybeSingle();

  const banner = STATUS_BANNER[pass.status] ?? STATUS_BANNER.pending_cover;
  const leaving = pass.leaving_datetime ?? pass.departure_date;
  const returning = pass.returning_datetime ?? pass.expected_return_date;

  return (
    <div className="mx-auto max-w-2xl space-y-6 print:space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">
          Print preview — use your browser or the button.
        </p>
        <PrintButton />
      </div>

      <div className="rounded-lg border-2 border-black p-8 space-y-6 print:border-black">
        <div className="text-center space-y-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {house?.name ?? "Residence"}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">OVERNIGHT PASS</h1>
          <p
            className={`inline-block mt-2 rounded border-2 px-4 py-1 text-sm font-bold tracking-widest ${banner.cls}`}
          >
            {banner.label}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <Field label="Resident" value={pass.resident.full_name} />
          <Field label="Covering Resident" value={pass.covering_resident?.full_name ?? "—"} />
          <Field label="Leaving" value={leaving ? formatDateOnly(leaving.slice(0, 10)) + (pass.leaving_datetime ? " " + leaving.slice(11, 16) : "") : "—"} />
          <Field label="Returning" value={returning ? formatDateOnly(returning.slice(0, 10)) + (pass.returning_datetime ? " " + returning.slice(11, 16) : "") : "—"} />
          <Field label="Destination" value={pass.destination_address ?? "—"} />
          <Field label="Transportation" value={pass.transportation ?? "—"} />
          <Field label="Companion" value={pass.companion ?? "—"} />
          <Field label="Reason" value={pass.reason_for_pass ?? pass.reason ?? "—"} />
        </div>

        {pass.denial_note && (
          <p className="text-sm text-red-700">
            Denial note: {pass.denial_note}
          </p>
        )}

        <div className="grid grid-cols-3 gap-6 pt-6 text-xs">
          <SignatureLine
            label="Covering Resident"
            signed={!!pass.cover_approved_at}
            at={pass.cover_approved_at}
          />
          <SignatureLine
            label="House Manager"
            signed={!!pass.house_manager_approved_at}
            at={pass.house_manager_approved_at}
          />
          <SignatureLine
            label="Admin"
            signed={!!pass.admin_approved_at}
            at={pass.admin_approved_at}
          />
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          Pass #{pass.id.slice(0, 8)} · Issued{" "}
          {pass.created_at ? formatDateOnly(pass.created_at.slice(0, 10)) : ""}
        </p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function SignatureLine({
  label,
  signed,
  at,
}: {
  label: string;
  signed: boolean;
  at: string | null;
}) {
  return (
    <div className="space-y-6">
      <div className="border-b border-black" />
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">
        {signed && at
          ? `Signed ${formatDateOnly(at.slice(0, 10))}`
          : "Signature / Date"}
      </p>
    </div>
  );
}
