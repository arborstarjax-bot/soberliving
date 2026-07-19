"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

export function BulletinTabs({ userRole }: { userRole: UserRole }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isPosts = pathname === "/bulletin" && searchParams.get("report") !== "1";
  const isReport = pathname === "/bulletin" && searchParams.get("report") === "1";
  const isRideShare = pathname.startsWith("/bulletin/ride-share");
  const isBlockers = pathname.startsWith("/bulletin/blockers");
  const isGrievances = pathname.startsWith("/bulletin/grievances");
  const isStaff = userRole === "admin" || userRole === "manager";

  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-xl border bg-muted/30 p-1 w-fit max-w-full">
      <TabLink href="/bulletin" active={isPosts}>
        Bulletin Board
      </TabLink>
      <TabLink href="/bulletin/ride-share" active={isRideShare}>
        Ride Share
      </TabLink>
      <TabLink href="/bulletin?report=1" active={isReport}>
        Report
      </TabLink>
      {isStaff && (
        <TabLink href="/bulletin/blockers" active={isBlockers}>
          Notices
        </TabLink>
      )}
      {isStaff && (
        <TabLink href="/bulletin/grievances" active={isGrievances}>
          Reports
        </TabLink>
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "px-4 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors",
        active
          ? "bg-background shadow-sm text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
