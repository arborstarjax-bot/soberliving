import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { findPendingBlockerForUser } from "@/lib/blockers";
import { AcknowledgeForm } from "./acknowledge-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatInAppTz } from "@/lib/timezone";
import { escapeToDashboard } from "./actions";

/**
 * Terminal "nothing to acknowledge here" card. Rendered instead of
 * redirecting to /dashboard when the blocker referenced by the URL
 * is gone / archived / already acked. Rendering a page here (rather
 * than redirecting) is deliberate: it guarantees the /acknowledge
 * route cannot participate in a redirect loop, even if some other
 * layout still disagrees about whether this blocker is pending.
 *
 * The Back to Dashboard button submits to `escapeToDashboard`, which
 * upserts a best-effort ack row for this (blocker, user) pair before
 * redirecting. That guarantees `findPendingBlockerForUser` returns
 * a different id (or null) on the very next request, unsticking
 * any resident whose pending_blocker_id has gone stale.
 */
function NothingToAcknowledge({
  blockerId,
  message,
}: {
  blockerId: string;
  message: string;
}) {
  async function handleEscape() {
    "use server";
    await escapeToDashboard(blockerId);
  }
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">You&apos;re all caught up</h1>
        <p className="text-muted-foreground mt-1">{message}</p>
      </div>
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          If you expected to see a message here, please contact your house
          manager.
        </CardContent>
        <CardFooter>
          <form action={handleEscape}>
            <Button type="submit">Back to dashboard</Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AcknowledgePage({ params }: PageProps) {
  const user = await requireAuth();
  const { id } = await params;
  const admin = createAdminClient();

  const { data: blocker } = await admin
    .from("blockers")
    .select(
      "id, title, body, attachment_paths, save_to_docs, require_signature, target_type, target_house_ids, target_user_ids, archived_at, created_at, created_by, author:users!created_by(full_name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!blocker || blocker.archived_at) {
    // Blocker went away (archived, deleted, or bad id). Render a
    // terminal "nothing to acknowledge" card rather than redirecting
    // — if the dashboard layout still thinks this blocker is pending
    // (e.g. getSessionUser's staleness check disagreed with what we
    // see here because of a race or drift) a redirect back there
    // would ping-pong forever. The Back to Dashboard button posts
    // to `escapeToDashboard`, which forces an ack row in so the gate
    // reliably advances on the next request.
    return (
      <NothingToAcknowledge
        blockerId={id}
        message="This message was archived or removed before you got to it."
      />
    );
  }

  // Staff can visit this URL for audit/preview purposes but don't
  // get the signing form — we redirect them to the admin view.
  if (user.role !== "resident") {
    redirect(`/bulletin/blockers?highlight=${blocker.id}`);
  }

  // Re-check targeting so a resident who URL-guesses can't ack
  // someone else's blocker. Confirm this exact blocker is in their
  // applicable set (pending OR already acked).
  const targetType = blocker.target_type as string;
  let applicable = false;
  if (targetType === "all") {
    applicable = true;
  } else if (targetType === "residents") {
    const arr = (blocker.target_user_ids as string[] | null) ?? [];
    applicable = arr.includes(user.id);
  } else if (targetType === "house") {
    const { data: residentRow } = await admin
      .from("residents")
      .select("house_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const houseId = (residentRow?.house_id as string | null) ?? null;
    const arr = (blocker.target_house_ids as string[] | null) ?? [];
    applicable = !!houseId && arr.includes(houseId);
  }
  if (!applicable) {
    notFound();
  }

  // Already acked? Jump to the next pending blocker if one exists.
  // If none do, render a terminal "caught up" card instead of
  // redirecting to /dashboard — for the same reason as the archived
  // branch above, we never want this route to redirect in a way
  // that could ping-pong with the dashboard gate.
  const { data: existingAck } = await admin
    .from("blocker_acknowledgments")
    .select("blocker_id")
    .eq("blocker_id", blocker.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingAck) {
    const next = await findPendingBlockerForUser(user.id, admin);
    if (next && next !== blocker.id) redirect(`/acknowledge/${next}`);
    return (
      <NothingToAcknowledge
        blockerId={blocker.id as string}
        message="You already acknowledged this message."
      />
    );
  }

  const authorData = Array.isArray(blocker.author)
    ? (blocker.author as Array<{ full_name: string }>)[0]
    : (blocker.author as { full_name: string } | null);
  const authorName = authorData?.full_name ?? "Staff";
  const paths = (blocker.attachment_paths as string[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Required Acknowledgment</h1>
        <p className="text-muted-foreground mt-1">
          {blocker.require_signature !== false
            ? "Please review and sign to continue using the app."
            : "Please review and acknowledge to continue using the app."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{blocker.title as string}</CardTitle>
          <p className="text-xs text-muted-foreground">
            From {authorName} •{" "}
            {formatInAppTz(blocker.created_at as string, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="whitespace-pre-wrap text-sm">
            {blocker.body as string}
          </div>
        </CardContent>
      </Card>

      <AcknowledgeForm
        blockerId={blocker.id as string}
        title={blocker.title as string}
        body={blocker.body as string}
        attachmentPaths={paths}
        saveToDocs={Boolean(blocker.save_to_docs)}
        requireSignature={blocker.require_signature !== false}
        residentName={user.full_name}
      />
    </div>
  );
}
