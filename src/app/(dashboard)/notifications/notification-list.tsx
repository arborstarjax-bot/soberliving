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
import { CoverRequestActions } from "./cover-request-actions";
import { ChoreSignoffActions } from "./chore-signoff-actions";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
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

interface LeaveStatus {
  status: string;
  rejection_step: string | null;
}

interface SignoffStatus {
  status: string;
  reviewer_name: string | null;
  reviewed_at: string | null;
  rejection_note: string | null;
}

interface NotificationListProps {
  notifications: Notification[];
  activeTab: string;
  meta: PaginationMeta;
  searchParams: Record<string, string | string[] | undefined>;
  leaveStatusMap?: Record<string, LeaveStatus>;
  signoffStatusMap?: Record<string, SignoffStatus>;
  viewerRole?: "admin" | "manager" | "resident";
}

export function NotificationList({
  notifications,
  activeTab,
  meta,
  searchParams,
  leaveStatusMap = {},
  signoffStatusMap = {},
  viewerRole,
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
            {notifications.map((n) => {
              const isPastCurfew = !!n.metadata?.past_curfew;
              return (
              <Card
                key={n.id}
                className={cn(
                  n.is_read ? "opacity-60" : "border-primary/20",
                  isPastCurfew && "border-red-300 bg-red-50/50"
                )}
              >
                <CardContent className="flex items-start gap-3 py-3">
                  <div className={cn("mt-0.5", isPastCurfew ? "text-red-500" : "text-muted-foreground")}>
                    {getNotificationIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn("font-medium text-sm", isPastCurfew && "text-red-700")}>{n.title}</p>
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
                      {new Date(n.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })}
                    </p>
                    {/* Leave-request approval notifications are
                        actionable. Covering resident, house manager, and
                        admin can each approve/deny their stage inline so
                        they don't have to leave the Notifications page.
                        Server-side RBAC in the action still enforces
                        who may act at each stage. */}
                    {viewerRole !== "resident" &&
                      n.type === "chore_submitted" &&
                      n.entity_type === "chore_signoff" &&
                      n.entity_id && (
                        <ChoreSignoffActions
                          signoffId={n.entity_id}
                          notificationId={n.id}
                          currentStatus={
                            signoffStatusMap[n.entity_id]?.status
                          }
                          reviewerName={
                            signoffStatusMap[n.entity_id]?.reviewer_name
                          }
                          reviewedAt={
                            signoffStatusMap[n.entity_id]?.reviewed_at
                          }
                          rejectionNote={
                            signoffStatusMap[n.entity_id]?.rejection_note
                          }
                        />
                      )}
                    {n.entity_type === "leave_request" && n.entity_id && (
                      <>
                        {n.type === "cover_request" && (
                          <CoverRequestActions
                            stage="cover"
                            leaveRequestId={n.entity_id}
                            notificationId={n.id}
                            currentStatus={leaveStatusMap[n.entity_id]?.status}
                            rejectionStep={
                              leaveStatusMap[n.entity_id]?.rejection_step ?? null
                            }
                          />
                        )}
                        {n.type === "manager_approval" && (
                          <CoverRequestActions
                            stage="manager"
                            leaveRequestId={n.entity_id}
                            notificationId={n.id}
                            currentStatus={leaveStatusMap[n.entity_id]?.status}
                            rejectionStep={
                              leaveStatusMap[n.entity_id]?.rejection_step ?? null
                            }
                          />
                        )}
                        {n.type === "admin_approval" && (
                          <CoverRequestActions
                            stage="admin"
                            leaveRequestId={n.entity_id}
                            notificationId={n.id}
                            currentStatus={leaveStatusMap[n.entity_id]?.status}
                            rejectionStep={
                              leaveStatusMap[n.entity_id]?.rejection_step ?? null
                            }
                          />
                        )}
                      </>
                    )}
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
              );
            })}
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
