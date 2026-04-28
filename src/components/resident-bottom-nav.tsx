"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ClipboardCheck,
  CalendarClock,
  MessageSquare,
  MoreHorizontal,
  ShieldAlert,
  Folder,
  Flag,
  Bell,
  LogOut,
  X,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

interface BottomNavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY_ITEMS: BottomNavItem[] = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Chores", href: "/chores", icon: ClipboardCheck },
  { label: "Bulletin", href: "/bulletin", icon: MessageSquare },
  { label: "Leave", href: "/leave-requests", icon: CalendarClock },
];

const MORE_ITEMS: BottomNavItem[] = [
  { label: "Discipline", href: "/discipline", icon: ShieldAlert },
  { label: "My Documents", href: "/my-documents", icon: Folder },
  { label: "Report", href: "/report", icon: Flag },
  { label: "Notifications", href: "/notifications", icon: Bell },
];

interface ResidentBottomNavProps {
  hasNoLeaveRestriction?: boolean;
  notificationBadge?: React.ReactNode;
  bulletinBadge?: React.ReactNode;
}

export function ResidentBottomNav({
  hasNoLeaveRestriction,
  notificationBadge = null,
  bulletinBadge = null,
}: ResidentBottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryItems = hasNoLeaveRestriction
    ? PRIMARY_ITEMS.filter((item) => item.href !== "/leave-requests")
    : PRIMARY_ITEMS;

  const isActive = useCallback(
    (href: string) =>
      pathname === href ||
      (href !== "/dashboard" && pathname.startsWith(href)),
    [pathname]
  );

  const moreIsActive = MORE_ITEMS.some((item) => isActive(item.href));

  // Close More panel on route change
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <>
      {/* More sheet overlay */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More sheet */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-200 ease-out lg:hidden",
          moreOpen ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="rounded-t-2xl bg-white border-t border-gray-200 shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-700">More</span>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="grid grid-cols-4 gap-1 p-3">
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs font-medium transition",
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50 active:bg-gray-100"
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "text-blue-700")} />
                  <span className="truncate leading-none">{item.label}</span>
                  {item.href === "/notifications" && !active && notificationBadge}
                </Link>
              );
            })}
          </nav>
          <div className="px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Bottom navigation bar */}
      <nav
        aria-label="Resident navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul
          className="mx-auto grid max-w-md"
          style={{
            gridTemplateColumns: `repeat(${primaryItems.length + 1}, minmax(0, 1fr))`,
          }}
        >
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href} className="flex">
                <Link
                  href={item.href}
                  className={cn(
                    "flex w-full flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition active:bg-gray-100",
                    active
                      ? "text-blue-700"
                      : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  <Icon
                    className={cn("h-[22px] w-[22px]", active && "text-blue-700")}
                    aria-hidden="true"
                  />
                  <span className="max-w-full truncate leading-none">
                    {item.label}
                  </span>
                  {item.href === "/bulletin" && !active && bulletinBadge}
                </Link>
              </li>
            );
          })}
          {/* More button */}
          <li className="flex">
            <button
              type="button"
              onClick={() => setMoreOpen(!moreOpen)}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition active:bg-gray-100",
                moreIsActive || moreOpen
                  ? "text-blue-700"
                  : "text-gray-500 hover:text-gray-800"
              )}
            >
              <MoreHorizontal
                className={cn(
                  "h-[22px] w-[22px]",
                  (moreIsActive || moreOpen) && "text-blue-700"
                )}
                aria-hidden="true"
              />
              <span className="leading-none">More</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
