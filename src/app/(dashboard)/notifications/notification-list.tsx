"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/pagination";
import type { PaginationMeta } from "@/lib/pagination";
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "./actions";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPE_TO_CATEGORY,
} from "./categories";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

function getCategory(type: string): string {
  return NOTIFICATION_TYPE_TO_CATEGORY[type] ?? "Other";
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

// Build a tab href that selects `tab` and resets `page=1`, preserving
// any other query params.
function buildTabHref(
  tab: string,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "tab" || key === "page") continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  if (tab !== "All") params.set("tab", tab);
  const qs = params.toString();
  return qs ? `/notifications?${qs}` : "/notifications";
}

interface NotificationListProps {
  notifications: Notification[];
  activeTab: string;
  meta: PaginationMeta;
  searchParams: Record<string, string | string[] | undefined>;
}

export function NotificationList({
  notifications,
  activeTab,
  meta,
  searchParams,
}: NotificationListProps) {
  const [isPending, startTransition] = useTransition();
  const unreadOnPage = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-4">
      {unreadOnPage > 0 && (
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

      {/* URL-driven tab strip — same visual pattern as the Activity Log
          tabs so the app feels consistent across paginated list pages. */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/50 bg-muted/30 p-1">
        {NOTIFICATION_CATEGORIES.map((cat) => {
          const isActive = cat === activeTab;
          return (
            <Link
              key={cat}
              href={buildTabHref(cat, searchParams)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              )}
            >
              {cat}
            </Link>
          );
        })}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              {activeTab === "All"
                ? "No notifications"
                : `No notifications in ${activeTab}`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {notifications.map((n) => (
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
                    <p className="text-sm text-muted-foreground">{n.message}</p>
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
          <Pagination
            meta={meta}
            basePath="/notifications"
            searchParams={searchParams}
            itemLabel="notifications"
          />
        </>
      )}
    </div>
  );
}
