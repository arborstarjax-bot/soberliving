import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Page-level loading indicator. Dropped into a route segment's
 * `loading.tsx` so the spinner paints the instant the user clicks a
 * nav link — while Next.js is still running the next page's async
 * server render. Pairs with in-page `<Suspense>` boundaries which
 * handle finer-grained data streaming once the shell is ready.
 */
export function PageSpinner({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center gap-2 py-16 text-muted-foreground",
        className
      )}
    >
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
