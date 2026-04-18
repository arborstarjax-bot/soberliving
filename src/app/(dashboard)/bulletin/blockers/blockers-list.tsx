"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Archive, Paperclip, Loader2 } from "lucide-react";
import { archiveBlocker } from "./actions";
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

interface BlockerItem {
  id: string;
  title: string;
  body: string;
  attachment_paths: string[];
  target_type: BlockerTargetType;
  target_house_ids: string[];
  target_user_ids: string[];
  save_to_docs: boolean;
  created_by: string;
  created_at: string;
  archived_at: string | null;
  author_name: string;
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
        <h2 className="text-lg font-semibold">Active Blockers</h2>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active blockers.
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
  const [error, setError] = useState<string | null>(null);

  const canArchive =
    !item.archived_at &&
    (currentUserRole === "admin" || item.created_by === currentUserId);

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

  const targetDescription =
    item.target_type === "all"
      ? "Everyone"
      : item.target_type === "house"
        ? `${item.target_house_ids.length} house(s): ${item.target_house_ids
            .map((id) => houseNameById.get(id) ?? id.slice(0, 6))
            .join(", ")}`
        : `${item.target_user_ids.length} resident(s)`;

  return (
    <Card className={item.archived_at ? "opacity-60" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">{item.title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              By {item.author_name} • {formatDateTime(item.created_at)}
              {item.archived_at && ` • Archived ${formatDateTime(item.archived_at)}`}
            </p>
          </div>
          {canArchive && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
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
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm whitespace-pre-wrap">{item.body}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Target: {targetDescription}</span>
          <span>
            Acknowledged: {item.ack_count}/{item.target_count}
          </span>
          {item.attachment_paths.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              {item.attachment_paths.length} attachment(s)
            </span>
          )}
          {item.save_to_docs && <span>Saved to Documents on ack</span>}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
