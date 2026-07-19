import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Paperclip } from "lucide-react";
import { canAccessHouse } from "@/lib/permissions";
import { formatInAppTz } from "@/lib/timezone";
import type { GrievanceStatus, GrievanceType } from "@/lib/types";
import { StatusPicker } from "./status-picker";
import { NotesEditor } from "./notes-editor";
import { AttachmentLink } from "./attachment-link";

export default async function GrievanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuth();
  if (user.role !== "admin" && user.role !== "manager") {
    redirect("/bulletin");
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("grievances")
    .select(
      "id, report_type, subject, description, status, created_at, submitted_anonymously, user_id, house_id, workspace_id, attachment_paths, internal_notes, resolved_at, resolved_by, reporter:users!user_id(full_name, email), house:houses!house_id(id, name), resolver:users!resolved_by(full_name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!row) notFound();

  // Workspace isolation: a grievance (including an anonymous one with
  // no house) must belong to the viewer's workspace.
  const rowWorkspaceId = (row.workspace_id as string | null) ?? null;
  if (user.workspace_id && rowWorkspaceId !== user.workspace_id) {
    redirect("/bulletin/grievances");
  }

  const houseId = (row.house_id as string | null) ?? null;
  if (user.role === "manager") {
    if (!houseId || !canAccessHouse(user, houseId)) redirect("/bulletin/grievances");
  }

  const reporter = Array.isArray(row.reporter)
    ? (row.reporter as Array<{ full_name: string; email: string }>)[0] ?? null
    : (row.reporter as { full_name: string; email: string } | null);
  const house = Array.isArray(row.house)
    ? (row.house as Array<{ id: string; name: string }>)[0] ?? null
    : (row.house as { id: string; name: string } | null);
  const resolver = Array.isArray(row.resolver)
    ? (row.resolver as Array<{ full_name: string }>)[0] ?? null
    : (row.resolver as { full_name: string } | null);

  const isAnon = Boolean(row.submitted_anonymously);
  const attachmentPaths = (row.attachment_paths as string[] | null) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/bulletin/grievances"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Reports
        </Link>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="capitalize">
              {row.report_type as GrievanceType}
            </Badge>
            {isAnon && <Badge variant="secondary">Anonymous</Badge>}
            <span className="text-xs text-muted-foreground ml-auto">
              Filed{" "}
              {formatInAppTz(row.created_at as string, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
          <CardTitle>{row.subject as string}</CardTitle>
          <div className="text-xs text-muted-foreground">
            {isAnon ? (
              "Anonymous · no reporter or house recorded"
            ) : (
              <>
                {reporter?.full_name ?? "Unknown"}
                {reporter?.email ? ` · ${reporter.email}` : ""}
                {house?.name ? ` · ${house.name}` : ""}
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="whitespace-pre-wrap text-sm">
            {row.description as string}
          </div>

          {attachmentPaths.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Attachments
              </p>
              <div className="flex flex-wrap gap-2">
                {attachmentPaths.map((path) => (
                  <AttachmentLink
                    key={path}
                    grievanceId={id}
                    path={path}
                    fileName={path.split("/").pop() ?? path}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Status
              </p>
              <StatusPicker
                grievanceId={id}
                initialStatus={row.status as GrievanceStatus}
              />
              {row.status === "resolved" && resolver?.full_name && (
                <p className="text-xs text-muted-foreground">
                  Resolved by {resolver.full_name}
                  {row.resolved_at
                    ? ` · ${formatInAppTz(
                        row.resolved_at as string,
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }
                      )}`
                    : ""}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Internal Notes
              </p>
              <NotesEditor
                grievanceId={id}
                initialValue={(row.internal_notes as string | null) ?? ""}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
