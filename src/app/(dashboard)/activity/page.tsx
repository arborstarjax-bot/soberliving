import { Suspense } from "react";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { ListSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ACTIVITY_CATEGORIES } from "./categories";
import { ActivityListSection } from "./activity-list-section";

function normalizeTab(
  raw: string | string[] | undefined
): (typeof ACTIVITY_CATEGORIES)[number] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return "All";
  const match = ACTIVITY_CATEGORIES.find(
    (c) => c.toLowerCase() === value.toLowerCase()
  );
  return match ?? "All";
}

/** Build a tab href that selects `tab` and drops cursor state so
 *  tab switches always land on page 1. */
function buildTabHref(
  tab: string,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "tab" || key === "c" || key === "cp" || key === "page")
      continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  if (tab !== "All") params.set("tab", tab);
  const qs = params.toString();
  return qs ? `/activity?${qs}` : "/activity";
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Activity Log shell. Title + tab strip paint immediately; the
 * list + cursor pager stream in behind `<Suspense>`.
 */
export default async function ActivityLogPage({ searchParams }: PageProps) {
  const user = await requireAuth();
  const sp = await searchParams;
  const activeTab = normalizeTab(sp.tab);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <p className="text-muted-foreground">
          Recent activity across all houses
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/50 bg-muted/30 p-1">
        {ACTIVITY_CATEGORIES.map((cat) => {
          const isActive = cat === activeTab;
          return (
            <Link
              key={cat}
              href={buildTabHref(cat, sp)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              )}
            >
              {cat}
            </Link>
          );
        })}
      </div>

      <Suspense
        key={`${activeTab}-${String(sp.c ?? "")}`}
        fallback={<ListSkeleton rows={8} rowClassName="h-10 w-full" />}
      >
        <ActivityListSection
          user={user}
          activeTab={activeTab}
          searchParams={sp}
        />
      </Suspense>
    </div>
  );
}
