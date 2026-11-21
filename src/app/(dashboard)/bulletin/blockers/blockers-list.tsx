"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Archive,
  Paperclip,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronRight,
  PenLine,
  CheckCircle2,
} from "lucide-react";
import { archiveBlocker, deleteBlocker } from "./actions";
import { formatInAppTz } from "@/lib/timezone";
import type { BlockerTargetType, UserRole } from "@/lib/types";

function formatDateTime(iso: string): string {
  return formatInAppTz(iso, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface AckEntry {
  user_id: string;
  user_name: string;
  acknowledged_at: string;
  has_signature: boolean;
}

interface BlockerItem {
  id: string;
  title: string;
  body: string;
  attachment_paths: string[];
  target_type: BlockerTargetType;
  target_house_ids: string[];
  target_user_ids: string[];
  save_to_docs: boolean;
  require_signature: boolean;
  created_by: string;
  created_at: string;
  archived_at: string | null;
  author_name: string;
  acknowledgments: AckEntry[];
  ack_count: number;
  target_count: number;
}

interface BlockersListProps {
  items: BlockerItem[];
  houses: { id: string; name: string }[];
  currentUserId: string;
  currentUserRole: UserRole;
}

export function BlockersList({
  items,
  houses,
  currentUserId,
  currentUserRole,
}: BlockersListProps) {
  const active = items.filter((i) => !i.archived_at);
  const archived = items.filter((i) => i.archived_at);

  const houseNameById = new Map(houses.map((h) => [h.id, h.name]));

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Active Notices</h2>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active notices.
          </p>
        ) : (
          active.map((item) => (
            <BlockerRow
              key={item.id}
              item={item}
              houseNameById={houseNameById}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
            />
          ))
        )}
      </section>

      {archived.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-muted-foreground">
            Archived
          </h2>
          {archived.map((item) => (
            <BlockerRow
              key={item.id}
              item={item}
              houseNameById={houseNameById}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function BlockerRow({
  item,
  houseNameById,
  currentUserId,
  currentUserRole,
}: {
  item: BlockerItem;
  houseNameById: Map<string, string>;
  currentUserId: string;
  currentUserRole: UserRole;
}) {
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canArchive =
    !item.archived_at &&
    (currentUserRole === "admin" || item.created_by === currentUserId);
  const canDelete =
    currentUserRole === "admin" || item.created_by === currentUserId;

  function handleArchive() {
    if (!confirm("Archive this blocker? Residents who haven't acknowledged yet will no longer be blocked by it.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await archiveBlocker(item.id);
      if (r.error) setError(r.error);
    });
  }

  function handleDelete() {
    if (
      !confirm(
        "Delete this notice permanently? All acknowledgments will also be removed. This cannot be undone."
      )
    ) {
      return;
    }
    setError(null);
    startDeleteTransition(async () => {
      const r = await deleteBlocker(item.id);
      if (r.error) setError(r.error);
    });
  }

  const targetDescription =
    item.target_type === "all"
      ? "Everyone"
      : item.target_type === "house"
        ? `${item.target_house_ids.length} house(s): ${item.target_house_ids
            .map((id) => houseNameById.get(id) ?? id.slice(0, 6))
            .join(", ")}`
        : `${item.target_user_ids.length} resident(s)`;

  return (
    <Card
      id={`blocker-${item.id}`}
      className={item.archived_at ? "opacity-60" : undefined}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">{item.title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              By {item.author_name} • {formatDateTime(item.created_at)}
              {item.archived_at && ` • Archived ${formatDateTime(item.archived_at)}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canArchive && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending || isDeleting}
                onClick={handleArchive}
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Archive className="mr-2 h-3 w-3" />
                )}
                Archive
              </Button>
            )}
            {canDelete && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={isPending || isDeleting}
                onClick={handleDelete}
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-3 w-3" />
                )}
                Delete
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm whitespace-pre-wrap">{item.body}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Target: {targetDescription}</span>
          <span>
            Acknowledged: {item.ack_count}/{item.target_count}
          </span>
          <span>
            {item.require_signature
              ? "Signature required"
              : "Continue-only (no signature)"}
          </span>
          {item.attachment_paths.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              {item.attachment_paths.length} attachment(s)
            </span>
          )}
          {item.save_to_docs && <span>Saved to Documents on ack</span>}
        </div>
        <AcknowledgmentsToggle
          ackCount={item.ack_count}
          targetCount={item.target_count}
          acknowledgments={item.acknowledgments}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function AcknowledgmentsToggle({
  ackCount,
  targetCount,
  acknowledgments,
}: {
  ackCount: number;
  targetCount: number;
  acknowledgments: AckEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasAny = acknowledgments.length > 0;

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span>
          Acknowledgments ({ackCount}/{targetCount})
        </span>
      </button>
      {expanded && (
        <div className="mt-2 rounded-md border bg-muted/30 p-2">
          {!hasAny ? (
            <p className="text-xs text-muted-foreground">
              No one has acknowledged yet.
            </p>
          ) : (
            <ul className="divide-y">
              {acknowledgments.map((a) => (
                <li
                  key={a.user_id}
                  className="flex items-center gap-2 py-1.5 text-xs"
                >
                  {a.has_signature ? (
                    <PenLine
                      className="h-3 w-3 text-muted-foreground"
                      aria-label="Signed"
                    />
                  ) : (
                    <CheckCircle2
                      className="h-3 w-3 text-muted-foreground"
                      aria-label="Acknowledged"
                    />
                  )}
                  <span className="flex-1 font-medium">{a.user_name}</span>
                  <span className="text-muted-foreground">
                    {formatDateTime(a.acknowledged_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
