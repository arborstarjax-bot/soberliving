"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  ClipboardCheck,
  ShieldAlert,
  CalendarClock,
  MessageSquare,
  MoreHorizontal,
  Folder,
  Flag,
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
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Chores", href: "/chores", icon: ClipboardCheck },
  { label: "Discipline", href: "/discipline", icon: ShieldAlert },
  { label: "Leave", href: "/leave-requests", icon: CalendarClock },
  { label: "Bulletin", href: "/bulletin", icon: MessageSquare },
];

const MORE_ITEMS: BottomNavItem[] = [
  { label: "My Documents", href: "/my-documents", icon: Folder },
  { label: "Report", href: "/report", icon: Flag },
];

interface ResidentBottomNavProps {
  hasNoLeaveRestriction?: boolean;
  bulletinBadge?: React.ReactNode;
}

export function ResidentBottomNav({
  hasNoLeaveRestriction,
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
        <div className="rounded-t-2xl bg-sidebar border-t border-sidebar-border shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
            <span className="text-sm font-semibold text-sidebar-foreground">More</span>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-sidebar-foreground/60 hover:bg-sidebar-accent"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="grid grid-cols-3 gap-1 p-3">
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
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 active:bg-sidebar-accent/60"
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "text-sidebar-accent-foreground")} />
                  <span className="truncate leading-none">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 active:bg-sidebar-accent/60 transition"
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
        className="fixed inset-x-0 bottom-0 z-30 border-t border-sidebar-border bg-sidebar lg:hidden"
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
                    "flex w-full flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition",
                    active
                      ? "text-white"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                  )}
                >
                  <span className="relative">
                    <Icon
                      className={cn("h-[22px] w-[22px]", active && "text-white")}
                      aria-hidden="true"
                    />
                    {item.href === "/bulletin" && !active && bulletinBadge}
                  </span>
                  <span className="max-w-full truncate leading-none">
                    {item.label}
                  </span>
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
                "flex w-full flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition",
                moreIsActive || moreOpen
                  ? "text-white"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
              )}
            >
              <MoreHorizontal
                className={cn(
                  "h-[22px] w-[22px]",
                  (moreIsActive || moreOpen) && "text-white"
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
