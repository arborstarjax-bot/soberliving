"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

/**
 * Lightweight top-nav for /bulletin and /bulletin/blockers. Not a
 * base-ui Tabs component because the tabs are real routes (different
 * data fetches, different layouts) — this is just styled links.
 * The Blockers tab is hidden from residents since it's a staff-only
 * management view.
 */
export function BulletinTabs({ userRole }: { userRole: UserRole }) {
  const pathname = usePathname();
  const isPosts = pathname === "/bulletin";
  const isBlockers = pathname.startsWith("/bulletin/blockers");

  return (
    <div className="border-b">
      <nav className="-mb-px flex gap-6">
        <TabLink href="/bulletin" active={isPosts}>
          Posts
        </TabLink>
        {(userRole === "admin" || userRole === "manager") && (
          <TabLink href="/bulletin/blockers" active={isBlockers}>
            Blockers
          </TabLink>
        )}
      </nav>
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
        "border-b-2 pb-3 text-sm font-medium transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
