import { cn } from "@/lib/utils";

/**
 * Generic shimmering placeholder for content that hasn't streamed in
 * yet. Paired with React's `<Suspense>` boundary on data-driven pages
 * so the page shell renders instantly and skeletons sit in for
 * pending rows.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-gray-200/70 dark:bg-gray-800/60",
        className
      )}
      {...props}
    />
  );
}

/**
 * Generic skeleton for a paged list of 20 rows. Height/row styling
 * can be tuned per page via the `rowClassName` prop. Used as the
 * Suspense fallback when a list is still fetching.
 */
export function ListSkeleton({
  rows = 6,
  rowClassName = "h-24 w-full",
  className,
}: {
  rows?: number;
  rowClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={rowClassName} />
      ))}
    </div>
  );
}
