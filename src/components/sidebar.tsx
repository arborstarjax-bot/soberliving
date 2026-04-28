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
  Settings,
  LogOut,
  LogOut as SignOutIcon,
  Menu,
  X,
  ShieldAlert,
  MessageSquare,
  Bell,
  Folder,
  DollarSign,
  Flag,
  Building2,
} from "lucide-react";
import { useState, useMemo } from "react";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { usePrefetchRoutes } from "@/lib/use-prefetch-routes";

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
    label: "Overnight Request",
    href: "/leave-requests",
    icon: CalendarClock,
    roles: ["admin", "manager", "resident"],
  },
  {
    // Staff-only nav link. Residents don't see this — they sign in /
    // out via the toggle at the top of their dashboard and don't need
    // a roster of who else is out.
    label: "Sign Out Sheet",
    href: "/sign-out-sheet",
    icon: SignOutIcon,
    roles: ["admin", "manager"],
  },
  {
    // Staff-only Payments hub — By Resident / Outstanding / Paid tabs.
    // Residents have their own payments view at /payments but reach it
    // via the Next Due hero card on their dashboard, not a nav link,
    // so the sidebar stays uncluttered for them.
    label: "Payments",
    href: "/payments",
    icon: DollarSign,
    roles: ["admin", "manager"],
  },
  {
    // Resident-facing doc library — application, signed commitment,
    // payment receipts. Staff already see these on the resident profile
    // Documents tab so this nav entry is resident-only.
    label: "My Documents",
    href: "/my-documents",
    icon: Folder,
    roles: ["resident"],
  },
  {
    label: "Community Services",
    href: "/bulletin",
    icon: MessageSquare,
    roles: ["admin", "manager", "resident"],
  },
  {
    // Resident-only entry point to file a grievance or report a
    // problem. Staff manage the inventory under Bulletin → Reports,
    // so they don't need the submit form in the nav.
    label: "Report",
    href: "/report",
    icon: Flag,
    roles: ["resident"],
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: Bell,
    roles: ["admin", "manager", "resident"],
  },
  {
    label: "Workspace",
    href: "/admin/workspace",
    icon: Building2,
    roles: ["admin"],
  },
  // Intake Review is now a tab inside the Residents page
  // Users & Roles folded into Residents page — /users route still works for direct access
  // Activity Log is no longer a primary nav item — reachable from the
  // admin dashboard Activity tile or the per-resident profile timeline.
  // Settings is no longer a primary nav item — admins reach it via
  // the gear icon in the user footer area at the bottom of the
  // sidebar (see navContent below). Residents and managers don't have
  // meaningful settings today, so there's no entry for them either.
];

interface SidebarProps {
  role: UserRole;
  userName: string;
  hasNoLeaveRestriction?: boolean;
  // Badges are passed as React nodes (not numbers) so the server
  // can stream them into the sidebar behind `<Suspense>` — the
  // sidebar paints immediately and the badges fill in on their own.
  // Each slot resolves to either a `<span>` with the count or `null`.
  notificationBadge?: React.ReactNode;
  bulletinBadge?: React.ReactNode;
}

export function Sidebar({
  role,
  userName,
  hasNoLeaveRestriction,
  notificationBadge = null,
  bulletinBadge = null,
}: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredItems = NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(role)) return false;
    if (item.href === "/leave-requests" && hasNoLeaveRestriction) return false;
    if (item.href === "/incidents") return false;
    return true;
  });

  const routesToPrefetch = useMemo(
    () => filteredItems.map((item) => item.href),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, hasNoLeaveRestriction]
  );
  usePrefetchRoutes(routesToPrefetch);

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
              <span className="relative shrink-0">
                <item.icon className="h-4 w-4" />
                {(item.href === "/notifications" && !isActive && notificationBadge) ||
                 (item.href === "/bulletin" && !isActive && bulletinBadge)}
              </span>
              {item.label}
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
          {role === "admin" && (
            <Link
              href="/settings"
              onClick={() => setMobileOpen(false)}
              aria-label="Settings"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
            >
              <Settings className="h-4 w-4" />
            </Link>
          )}
        </div>
        {/* PWA install affordance. The button self-hides when the app
            is already running in standalone mode, or on browsers that
            don't support install prompts, so it won't linger as a dead
            element for already-installed users. */}
        <div className="px-3 pb-2">
          <InstallAppButton className="w-full" />
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
        <span className="ml-2 font-semibold flex-1">Sober Living</span>
        {role === "resident" && (
          <Link
            href="/notifications"
            className="relative inline-flex items-center justify-center h-11 w-11 -mr-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent/50 active:bg-sidebar-accent/60 active:scale-95 transition"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {notificationBadge}
          </Link>
        )}
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
