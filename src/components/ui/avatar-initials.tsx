import { cn } from "@/lib/utils";

/**
 * Sobriety-based gradient tiers (days → color):
 *  0-30   red/rose   (early recovery)
 *  31-90  amber/orange
 *  91-180 yellow/lime
 *  181-365 emerald/teal
 *  365+   blue/indigo (long-term)
 */
const SOBRIETY_GRADIENTS = [
  { max: 30, gradient: "from-rose-500 to-red-600" },
  { max: 90, gradient: "from-amber-500 to-orange-600" },
  { max: 180, gradient: "from-yellow-500 to-lime-600" },
  { max: 365, gradient: "from-emerald-500 to-teal-600" },
  { max: Infinity, gradient: "from-blue-500 to-indigo-600" },
] as const;

const FALLBACK_PALETTE = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-blue-600",
  "from-fuchsia-500 to-pink-600",
  "from-lime-500 to-green-600",
] as const;

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getSobrietyGradient(days: number): string {
  for (const tier of SOBRIETY_GRADIENTS) {
    if (days <= tier.max) return tier.gradient;
  }
  return SOBRIETY_GRADIENTS[SOBRIETY_GRADIENTS.length - 1].gradient;
}

interface AvatarInitialsProps {
  name: string;
  size?: "sm" | "md" | "lg";
  sobrietyDays?: number | null;
  className?: string;
}

export function AvatarInitials({
  name,
  size = "md",
  sobrietyDays,
  className,
}: AvatarInitialsProps) {
  const gradient =
    sobrietyDays != null
      ? getSobrietyGradient(sobrietyDays)
      : FALLBACK_PALETTE[hashName(name) % FALLBACK_PALETTE.length];
  const initials = getInitials(name);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br font-semibold text-white shadow-sm",
        gradient,
        size === "sm" && "h-7 w-7 text-[10px]",
        size === "md" && "h-8 w-8 text-xs",
        size === "lg" && "h-10 w-10 text-sm",
        className
      )}
    >
      {initials}
    </span>
  );
}
