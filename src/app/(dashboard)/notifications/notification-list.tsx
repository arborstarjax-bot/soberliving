"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  CalendarClock,
  ClipboardCheck,
  ShieldAlert,
  MessageSquare,
} from "lucide-react";
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "./actions";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

// Map each notification `type` to a user-facing category label.
// Any type not listed here falls into "Other" so nothing is ever hidden.
const TYPE_TO_CATEGORY: Record<string, string> = {
  cover_request: "Leave",
  manager_approval: "Leave",
  admin_approval: "Leave",
  leave_approved: "Leave",
  leave_rejected: "Leave",
  leave_returned: "Leave",
  chore_reminder: "Chores",
  chore_assigned: "Chores",
  chore_completed: "Chores",
  chore_approved: "Chores",
  chore_rejected: "Chores",
  missed_chore: "Discipline",
  demerit_issued: "Discipline",
  demerit_worked_off: "Discipline",
  restriction_created: "Discipline",
  restriction_lifted: "Discipline",
  incident_logged: "Incidents",
  check_in_sent: "Check-Ins",
  check_in_submitted: "Check-Ins",
  bulletin_post: "Bulletin",
  bulletin_comment: "Bulletin",
  bulletin_like: "Bulletin",
  bed_assigned: "Housing",
  bed_changed: "Housing",
  discharge: "Housing",
};

function getCategory(type: string): string {
  return TYPE_TO_CATEGORY[type] ?? "Other";
}

function getNotificationIcon(type: string) {
  const cls = "h-4 w-4";
  switch (getCategory(type)) {
    case "Leave":
      return <CalendarClock className={cls} />;
    case "Chores":
      return <ClipboardCheck className={cls} />;
    case "Discipline":
    case "Incidents":
      return <ShieldAlert className={cls} />;
    default:
      return <Bell className={cls} />;
  }
}

export function NotificationList({
  notifications,
}: {
  notifications: Notification[];
}) {
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<string>("all");

  // Build category buckets dynamically from the data — a tab only appears
  // when there's at least one notification in that category.
  const { buckets, categories } = useMemo(() => {
    const buckets = new Map<string, Notification[]>();
    for (const n of notifications) {
      const cat = getCategory(n.type);
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat)!.push(n);
    }
    const categories = Array.from(buckets.keys()).sort();
    return { buckets, categories };
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const visible =
    activeTab === "all" ? notifications : buckets.get(activeTab) ?? [];

  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(() => {
                markAllNotificationsRead();
              })
            }
          >
            <CheckCheck className="mr-1 h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v ?? "all")}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">
            All
            {notifications.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1.5 text-[10px] px-1.5 py-0"
              >
                {notifications.length}
              </Badge>
            )}
          </TabsTrigger>
          {categories.map((cat) => {
            const items = buckets.get(cat) ?? [];
            const unread = items.filter((n) => !n.is_read).length;
            return (
              <TabsTrigger key={cat} value={cat}>
                {cat}
                {/* Unread count takes priority (primary color) — staff
                    care about "how many do I still need to read" more
                    than total volume. Falls back to total count badge
                    when everything is read. */}
                {unread > 0 ? (
                  <Badge
                    variant="default"
                    className="ml-1.5 text-[10px] px-1.5 py-0"
                  >
                    {unread}
                  </Badge>
                ) : items.length > 0 ? (
                  <Badge
                    variant="secondary"
                    className="ml-1.5 text-[10px] px-1.5 py-0"
                  >
                    {items.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {visible.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">No notifications</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {visible.map((n) => (
                <Card
                  key={n.id}
                  className={n.is_read ? "opacity-60" : "border-primary/20"}
                >
                  <CardContent className="flex items-start gap-3 py-3">
                    <div className="mt-0.5 text-muted-foreground">
                      {getNotificationIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{n.title}</p>
                        <Badge
                          variant="outline"
                          className="h-4 px-1 text-[10px] capitalize"
                        >
                          {getCategory(n.type)}
                        </Badge>
                        {!n.is_read && (
                          <Badge
                            variant="default"
                            className="h-4 px-1 text-[10px]"
                          >
                            New
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {n.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!n.is_read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(() => {
                              markNotificationRead(n.id);
                            })
                          }
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(() => {
                            deleteNotification(n.id);
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
