"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export interface CursorPagerProps {
  /**
   * Href for the "Previous" link — back-stack navigation so the user
   * returns to the exact page they came from. Pass `null` if this is
   * the first page (hides the button).
   */
  prevHref: string | null;
  /**
   * Href for the "Next" link. Pass `null` when there are no more
   * rows (hides the button).
   */
  nextHref: string | null;
  /** Optional descriptive label, e.g. "posts" or "ride shares". */
  itemLabel?: string;
}

/**
 * Paired Prev/Next buttons for cursor-paginated pages. Uses
 * `useTransition` so clicking a button shows a spinner without
 * blocking the rest of the page — combined with a `<Suspense>`
 * boundary around the list, the page shell stays interactive while
 * the next batch streams in.
 */
export function CursorPager({
  prevHref,
  nextHref,
  itemLabel = "items",
}: CursorPagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!prevHref && !nextHref) return null;

  const go = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 pt-4">
      <div className="text-xs text-muted-foreground">
        {isPending ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading {itemLabel}…
          </span>
        ) : (
          <span>Showing up to 20 {itemLabel} per page</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!prevHref || isPending}
          onClick={() => prevHref && go(prevHref)}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!nextHref || isPending}
          onClick={() => nextHref && go(nextHref)}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Fallback SSR-friendly links for no-JS / crawler visits */}
      <noscript>
        <div className="flex gap-2">
          {prevHref && <Link href={prevHref}>← Prev</Link>}
          {nextHref && <Link href={nextHref}>Next →</Link>}
        </div>
      </noscript>
    </div>
  );
}
