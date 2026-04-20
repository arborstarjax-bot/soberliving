"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import { cn } from "@/lib/utils";

/**
 * Horizontal house tabs for the Chores page. Admins get every active
 * house; managers get only the houses they're assigned to. Selection
 * lives in the `?house=<id>` search param so deep-links and refresh
 * both preserve the view. If no `house` param is present yet we show
 * "All" as active (matches the legacy multi-house rendering).
 */
interface HouseFilterTabsProps {
  houses: { id: string; name: string }[];
  selectedHouseId: string | null;
}

export function HouseFilterTabs({
  houses,
  selectedHouseId,
}: HouseFilterTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const setHouse = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set("house", id);
      else next.delete("house");
      const qs = next.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [params, pathname, router]
  );

  // Only show tabs when there's more than one house to pick from —
  // single-house managers don't need a toggle.
  if (houses.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-1 border-b">
      <TabButton
        active={selectedHouseId === null}
        onClick={() => setHouse(null)}
        disabled={isPending}
      >
        All Houses
      </TabButton>
      {houses.map((h) => (
        <TabButton
          key={h.id}
          active={selectedHouseId === h.id}
          onClick={() => setHouse(h.id)}
          disabled={isPending}
        >
          {h.name}
        </TabButton>
      ))}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative -mb-px border-b-2 px-3 py-2 text-sm transition-colors",
        active
          ? "border-primary font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
        disabled && "opacity-60"
      )}
    >
      {children}
    </button>
  );
}
