"use client";

import Link from "next/link";

interface SignOutTabsProps {
  activeTab: string;
}

const TABS = [
  { key: "all", label: "All" },
  { key: "past_curfew", label: "Past Curfew" },
] as const;

export function SignOutTabs({ activeTab }: SignOutTabsProps) {
  return (
    <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.key === "all" ? "/sign-out-sheet" : `/sign-out-sheet?tab=${tab.key}`}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === tab.key
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
