import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatInAppTz } from "@/lib/timezone";
import type {
  GrievanceStatus,
  GrievanceType,
  SessionUser,
} from "@/lib/types";

interface Row {
  id: string;
  report_type: GrievanceType;
  subject: string;
  status: GrievanceStatus;
  created_at: string;
  submitted_anonymously: boolean;
  reporter_name: string | null;
  house_name: string | null;
  attachment_count: number;
  has_notes: boolean;
}

/**
 * Grievances list — joined `grievances + reporter + house` up to
 * 200 rows, bucketed client-side into Open vs Resolved. Lives
 * behind a `<Suspense>` boundary on `page.tsx` so the header
 * paints immediately.
 *
 * Cursor pagination isn't added here because the page splits a
 * single dataset into two buckets client-side; adding per-bucket
 * cursor pagination needs a separate URL-plumbing pass (tracked
 * as follow-up alongside Residents / Leave Requests / Chores
 * tabs).
 */
export async function GrievancesListSection({ user }: { user: SessionUser }) {
  const admin = createAdminClient();

  let query = admin
    .from("grievances")
    .select(
      "id, report_type, subject, status, created_at, submitted_anonymously, user_id, house_id, attachment_paths, internal_notes, reporter:users!user_id(full_name), house:houses!house_id(name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (user.role === "admin" && user.workspace_house_ids.length > 0) {
    query = query.or(`house_id.in.(${user.workspace_house_ids.join(",")}),house_id.is.null`);
  } else if (user.role === "admin" && user.workspace_id) {
    query = query.is("house_id", null);
  } else if (user.role === "manager") {
    query = query.in("house_id", user.assigned_house_ids);
  }
  const { data: rows } = await query;

  const items: Row[] = (rows ?? []).map((r) => {
    const reporter = Array.isArray(r.reporter)
      ? (r.reporter as Array<{ full_name: string }>)[0] ?? null
      : (r.reporter as { full_name: string } | null);
    const house = Array.isArray(r.house)
      ? (r.house as Array<{ name: string }>)[0] ?? null
      : (r.house as { name: string } | null);
    const isAnon = Boolean(r.submitted_anonymously);
    return {
      id: r.id as string,
      report_type: r.report_type as GrievanceType,
      subject: r.subject as string,
      status: r.status as GrievanceStatus,
      created_at: r.created_at as string,
      submitted_anonymously: isAnon,
      reporter_name: isAnon ? null : reporter?.full_name ?? null,
      house_name: isAnon ? null : house?.name ?? null,
      attachment_count: ((r.attachment_paths as string[] | null) ?? []).length,
      has_notes:
        typeof r.internal_notes === "string" &&
        (r.internal_notes as string).trim().length > 0,
    };
  });

  const open = items.filter((i) => i.status !== "resolved");
  const resolved = items.filter((i) => i.status === "resolved");

  return (
    <>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Open</h2>
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open reports.</p>
        ) : (
          open.map((item) => <GrievanceRow key={item.id} item={item} />)
        )}
      </section>
      {resolved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-muted-foreground">
            Resolved
          </h2>
          {resolved.map((item) => (
            <GrievanceRow key={item.id} item={item} />
          ))}
        </section>
      )}
    </>
  );
}

function GrievanceRow({ item }: { item: Row }) {
  return (
    <Link href={`/bulletin/grievances/${item.id}`}>
      <Card className="hover:bg-muted/40 transition-colors">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="capitalize">
              {item.report_type}
            </Badge>
            <StatusBadge status={item.status} />
            {item.submitted_anonymously && (
              <Badge variant="secondary">Anonymous</Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {formatInAppTz(item.created_at, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
          <p className="font-medium">{item.subject}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {item.submitted_anonymously
                ? "Anonymous"
                : item.reporter_name ?? "Unknown reporter"}
            </span>
            {item.house_name && <span>· {item.house_name}</span>}
            {item.attachment_count > 0 && (
              <span>
                · {item.attachment_count} attachment
                {item.attachment_count === 1 ? "" : "s"}
              </span>
            )}
            {item.has_notes && <span>· has notes</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function StatusBadge({ status }: { status: GrievanceStatus }) {
  if (status === "open") return <Badge variant="destructive">Open</Badge>;
  if (status === "in_progress")
    return <Badge variant="outline">In Progress</Badge>;
  return <Badge variant="secondary">Resolved</Badge>;
}
