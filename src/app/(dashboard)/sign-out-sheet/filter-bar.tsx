"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

export interface SignOutFilterBarResident {
  id: string;
  full_name: string;
  house_name: string | null;
}

interface FilterBarProps {
  residents: SignOutFilterBarResident[];
  basePath?: string;
}

/**
 * Sign-out-sheet history filters. Writes selections to the URL
 * (`resident`, `from`, `to`) so the server component can read them
 * during render and issue the filtered cursor query. Navigating
 * via startTransition keeps the rest of the page interactive.
 *
 * Any filter change resets pagination (drops `c=` and `cp=`) so
 * the user always lands on page 1 of the filtered result set.
 */
export function SignOutHistoryFilterBar({ residents, basePath = "/attendance" }: FilterBarProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const resident = params.get("resident") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const tab = params.get("tab") ?? "";
  const hasAny = !!(resident || from || to);

  function apply(next: {
    resident?: string;
    from?: string;
    to?: string;
  }) {
    const sp = new URLSearchParams();
    if (tab) sp.set("tab", tab);
    const r = next.resident ?? resident;
    const f = next.from ?? from;
    const t = next.to ?? to;
    if (r) sp.set("resident", r);
    if (f) sp.set("from", f);
    if (t) sp.set("to", t);
    const qs = sp.toString();
    const url = qs ? `${basePath}?${qs}` : basePath;
    startTransition(() => router.push(url));
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 min-w-[200px]">
          <label className="text-xs font-medium text-muted-foreground">
            Resident
          </label>
          <select
            value={resident}
            onChange={(e) => apply({ resident: e.target.value })}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            disabled={isPending}
          >
            <option value="">All residents</option>
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
                {r.house_name ? ` · ${r.house_name}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            From
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => apply({ from: e.target.value })}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            To
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => apply({ to: e.target.value })}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            disabled={isPending}
          />
        </div>

        {hasAny && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => apply({ resident: "", from: "", to: "" })}
          >
            {isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="mr-1.5 h-3.5 w-3.5" />
            )}
            Clear
          </Button>
        )}

        {isPending && !hasAny && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Applying…
          </div>
        )}
      </div>
    </div>
  );
}
