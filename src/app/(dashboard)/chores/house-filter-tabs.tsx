"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { startTransition, useOptimistic } from "react";
import { cn } from "@/lib/utils";

/**
 * Horizontal house tabs for the Chores page. Admins get every active
 * house; managers get only the houses they're assigned to. Selection
 * lives in the `?house=<id>` search param so deep-links and refresh
 * both preserve the view.
 *
 * Each tab is a `<Link>` so Next.js auto-prefetches the destination
 * on hover / when visible, and the click-to-paint feel is instant:
 * `useOptimistic` flips the "active" border the moment the user
 * clicks, while the Suspense boundary below streams in the new
 * data. The previously-rendered tab stays visible during the
 * transition instead of collapsing to a skeleton.
 */
interface HouseFilterTabsProps {
  houses: { id: string; name: string }[];
  selectedHouseId: string | null;
}

export function HouseFilterTabs({
  houses,
  selectedHouseId,
}: HouseFilterTabsProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [optimisticHouseId, setOptimisticHouseId] =
    useOptimistic<string | null>(selectedHouseId);

  const hrefFor = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("house", id);
    else next.delete("house");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  // Single-house managers don't need a toggle.
  if (houses.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-1 border-b">
      <TabLink
        active={optimisticHouseId === null}
        href={hrefFor(null)}
        onClick={() =>
          startTransition(() => setOptimisticHouseId(null))
        }
      >
        All Houses
      </TabLink>
      {houses.map((h) => (
        <TabLink
          key={h.id}
          active={optimisticHouseId === h.id}
          href={hrefFor(h.id)}
          onClick={() =>
            startTransition(() => setOptimisticHouseId(h.id))
          }
        >
          {h.name}
        </TabLink>
      ))}
    </div>
  );
}

function TabLink({
  active,
  href,
  onClick,
  children,
}: {
  active: boolean;
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch
      onClick={onClick}
      scroll={false}
      className={cn(
        "relative -mb-px border-b-2 px-3 py-2 text-sm transition-colors",
        active
          ? "border-primary font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
