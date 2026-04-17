"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";
import {
  LayoutDashboard,
  Home,
  Users,
  ClipboardCheck,
  AlertTriangle,
  CalendarClock,
  UserCog,
  Activity,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldAlert,
  MessageSquare,
  Bell,
  FileText,
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "manager", "resident"],
  },
  {
    label: "Houses",
    href: "/houses",
    icon: Home,
    roles: ["admin", "manager"],
  },
  {
    label: "Residents",
    href: "/residents",
    icon: Users,
    roles: ["admin", "manager"],
  },
  {
    label: "Chores",
    href: "/chores",
    icon: ClipboardCheck,
    roles: ["admin", "manager", "resident"],
  },
  {
    label: "Incidents",
    href: "/incidents",
    icon: AlertTriangle,
    roles: ["admin", "manager"],
  },
  // NOTE: Incidents is hidden from nav via filter — it now lives as a Discipline tab
  {
    label: "Discipline",
    href: "/discipline",
    icon: ShieldAlert,
    roles: ["admin", "manager", "resident"],
  },
  {
    label: "Leave Requests",
    href: "/leave-requests",
    icon: CalendarClock,
    roles: ["admin", "manager", "resident"],
  },
  {
    label: "Bulletin",
    href: "/bulletin",
    icon: MessageSquare,
    roles: ["admin", "manager", "resident"],
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: Bell,
    roles: ["admin", "manager", "resident"],
  },
  // Intake Review is now a tab inside the Residents page
  // Users & Roles folded into Residents page — /users route still works for direct access
  {
    label: "Activity Log",
    href: "/activity",
    icon: Activity,
    roles: ["admin", "manager"],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    roles: ["admin"],
  },
];

interface SidebarProps {
  role: UserRole;
  userName: string;
  hasNoLeaveRestriction?: boolean;
  unreadNotificationCount?: number;
}

export function Sidebar({ role, userName, hasNoLeaveRestriction, unreadNotificationCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredItems = NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(role)) return false;
    // Hide Leave Requests for residents with No Leave restriction
    if (item.href === "/leave-requests" && hasNoLeaveRestriction) return false;
    // Incidents is now a tab inside Discipline — hide from nav
    if (item.href === "/incidents") return false;
    return true;
  });

  const navContent = (
    <>
      <div className="flex items-center border-b border-sidebar-border px-4 pt-[env(safe-area-inset-top)] h-[calc(3.5rem+env(safe-area-inset-top))]">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold text-sidebar-foreground"
          onClick={() => setMobileOpen(false)}
        >
          <Home className="h-5 w-5" />
          <span>Sober Living</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {filteredItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                // Nav rows are the primary tap target on phones — give
                // them at least 44px of effective height (py-3 = 48px
                // total) so they meet Apple's HIG minimum without
                // changing desktop density at lg: breakpoint.
                "flex items-center gap-3 rounded-md px-3 py-3 lg:py-2 text-sm font-medium transition active:scale-[0.98]",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground active:bg-sidebar-accent/60"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
              {item.href === "/notifications" && unreadNotificationCount > 0 && (
                <span className="ml-auto text-xs font-bold text-yellow-400">
                  +{unreadNotificationCount > 99 ? "99" : unreadNotificationCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-md px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">
            {userName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-sidebar-foreground">{userName}</p>
            <p className="text-xs text-sidebar-foreground/60 capitalize">{role}</p>
          </div>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle — sticks to the top on phones, respects notch /
          Dynamic Island via safe-area-inset-top so the bar isn't
          behind the camera cutout on notched devices. */}
      <div className="sticky top-0 z-40 flex h-14 items-center border-b border-sidebar-border bg-sidebar px-4 lg:hidden text-sidebar-foreground pt-[env(safe-area-inset-top)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] h-[calc(3.5rem+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="inline-flex items-center justify-center h-11 w-11 -ml-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent/50 active:bg-sidebar-accent/60 active:scale-95 transition"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
        <span className="ml-2 font-semibold">Sober Living</span>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar border-r border-sidebar-border transition-transform lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-sidebar-border lg:bg-sidebar">
        {navContent}
      </aside>
    </>
  );
}
