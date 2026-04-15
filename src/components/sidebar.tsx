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
  DollarSign,
  UserCog,
  Activity,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  MessageSquareText,
  ClipboardList,
  Bell,
  Scale,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  // Overview
  {
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        roles: ["resident"],
      },
      {
        label: "Admin Panel",
        href: "/admin",
        icon: ShieldCheck,
        roles: ["admin", "manager"],
      },
    ],
  },
  // House Management
  {
    title: "Management",
    items: [
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
        label: "Users & Roles",
        href: "/users",
        icon: UserCog,
        roles: ["admin"],
      },
      {
        label: "Intake Review",
        href: "/intake-review",
        icon: ClipboardList,
        roles: ["admin", "manager"],
      },
    ],
  },
  // Daily Operations
  {
    title: "Daily Operations",
    items: [
      {
        label: "Chores",
        href: "/chores",
        icon: ClipboardCheck,
        roles: ["admin", "manager", "resident"],
      },
      {
        label: "Leave Requests",
        href: "/leave-requests",
        icon: CalendarClock,
        roles: ["admin", "manager", "resident"],
      },
      {
        label: "Payments",
        href: "/payments",
        icon: DollarSign,
        roles: ["admin", "manager", "resident"],
      },
    ],
  },
  // Accountability
  {
    title: "Accountability",
    items: [
      {
        label: "House Discipline",
        href: "/discipline",
        icon: Scale,
        roles: ["admin", "manager", "resident"],
      },
      {
        label: "Incidents",
        href: "/incidents",
        icon: AlertTriangle,
        roles: ["admin", "manager"],
      },
    ],
  },
  // Communication
  {
    title: "Communication",
    items: [
      {
        label: "Bulletin Board",
        href: "/bulletin",
        icon: MessageSquareText,
        roles: ["admin", "manager", "resident"],
      },
      {
        label: "Notifications",
        href: "/notifications",
        icon: Bell,
        roles: ["admin", "manager", "resident"],
      },
    ],
  },
  // System
  {
    title: "System",
    items: [
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
    ],
  },
];

interface SidebarProps {
  role: UserRole;
  userName: string;
}

export function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Filter sections to only show items the user has access to
  const filteredSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);

  const navContent = (
    <>
      <div className="flex h-14 items-center border-b px-4">
        <Link
          href={role === "resident" ? "/dashboard" : "/admin"}
          className="flex items-center gap-2 font-semibold"
          onClick={() => setMobileOpen(false)}
        >
          <Home className="h-5 w-5" />
          <span>Sober Living</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-4">
        {filteredSections.map((section, idx) => (
          <div key={idx}>
            {section.title && (
              <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center gap-3 rounded-md px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            {userName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground capitalize">{role}</p>
          </div>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
      {/* Mobile toggle */}
      <div className="sticky top-0 z-40 flex h-14 items-center border-b bg-background px-4 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </Button>
        <span className="ml-3 font-semibold">Sober Living</span>
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
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-background border-r transition-transform lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:bg-background">
        {navContent}
      </aside>
    </>
  );
}
