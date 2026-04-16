"use client";

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

function getNotificationIcon(type: string) {
  const cls = "h-4 w-4";
  switch (type) {
    case "cover_request":
    case "manager_approval":
    case "admin_approval":
    case "leave_approved":
    case "leave_rejected":
      return <CalendarClock className={cls} />;
    case "chore_reminder":
    case "chore_completed":
      return <ClipboardCheck className={cls} />;
    case "missed_chore":
    case "demerit_issued":
    case "demerit_worked_off":
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

  const unreadCount = notifications.filter((n) => !n.is_read).length;

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

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No notifications yet</p>
          </CardContent>
        </Card>
      ) : (
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
      )}
    </div>
  );
}
