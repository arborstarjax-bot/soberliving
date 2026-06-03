"use client";

import Link from "next/link";

interface AttendanceTabsProps {
  activeTab: string;
  isStaff: boolean;
}

const STAFF_TABS = [
  { key: "currently_out", label: "Currently Out" },
  { key: "past_curfew", label: "Past Curfew" },
  { key: "overnight", label: "Overnight Requests" },
] as const;

const RESIDENT_TABS = [
  { key: "overnight", label: "Overnight Requests" },
] as const;

export function AttendanceTabs({ activeTab, isStaff }: AttendanceTabsProps) {
  const tabs = isStaff ? STAFF_TABS : RESIDENT_TABS;

  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-xl border bg-muted/30 p-1 w-fit">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`/attendance?tab=${tab.key}`}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
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
