import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaginationMeta } from "@/lib/pagination";

interface PaginationProps {
  meta: PaginationMeta;
  // Current URL pathname (e.g. "/activity"). Prev/Next links keep every
  // other query param and just change `page`.
  basePath: string;
  // The current request's full searchParams, so we can rebuild the query
  // string without losing filter state (tab, range, q, etc.).
  searchParams?: Record<string, string | string[] | undefined>;
  // Label used in the summary ("1–20 of 847 entries"). Defaults to "items".
  itemLabel?: string;
  className?: string;
}

function buildHref(
  basePath: string,
  searchParams: Record<string, string | string[] | undefined> | undefined,
  page: number
): string {
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "page") continue;
      if (Array.isArray(value)) {
        for (const v of value) params.append(key, v);
      } else if (value !== undefined) {
        params.set(key, value);
      }
    }
  }
  params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({
  meta,
  basePath,
  searchParams,
  itemLabel = "items",
  className,
}: PaginationProps) {
  // Hide the control entirely when everything fits on one page — keeps
  // finite lists like "2 bulletins" looking clean.
  if (meta.totalPages <= 1) return null;

  const prevHref = meta.hasPrev
    ? buildHref(basePath, searchParams, meta.page - 1)
    : null;
  const nextHref = meta.hasNext
    ? buildHref(basePath, searchParams, meta.page + 1)
    : null;

  const pillBase =
    "inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors";
  const pillEnabled = "hover:bg-accent hover:text-accent-foreground";
  const pillDisabled = "opacity-50 pointer-events-none";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 pt-4 border-t border-border/50",
        className
      )}
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        Showing <span className="font-medium">{meta.from.toLocaleString()}</span>
        {"–"}
        <span className="font-medium">{meta.to.toLocaleString()}</span> of{" "}
        <span className="font-medium">{meta.total.toLocaleString()}</span>{" "}
        {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        {prevHref ? (
          <Link href={prevHref} className={cn(pillBase, pillEnabled)}>
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Link>
        ) : (
          <span className={cn(pillBase, pillDisabled)} aria-disabled>
            <ChevronLeft className="h-4 w-4" />
            Prev
          </span>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">
          Page <span className="font-medium">{meta.page}</span> of{" "}
          <span className="font-medium">{meta.totalPages}</span>
        </span>
        {nextHref ? (
          <Link href={nextHref} className={cn(pillBase, pillEnabled)}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className={cn(pillBase, pillDisabled)} aria-disabled>
            Next
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </div>
  );
}
