import { cn } from "@/lib/utils";

/**
 * Sobriety-based color tiers matching the milestone badge scale:
 *   ≤29 days  → White (neutral)
 *   30–59     → Brown (saddle)
 *   60–89     → Purple
 *   90–181    → Red
 *   182–272   → Yellow
 *   273–364   → Green
 *   365+      → Blue
 */
function getSobrietyClasses(days: number): { bg: string; text: string; border?: string } {
  if (days >= 365) return { bg: "bg-blue-600", text: "text-white" };
  if (days >= 273) return { bg: "bg-green-600", text: "text-white" };
  if (days >= 182) return { bg: "bg-yellow-300", text: "text-gray-900" };
  if (days >= 90) return { bg: "bg-red-600", text: "text-white" };
  if (days >= 60) return { bg: "bg-purple-600", text: "text-white" };
  if (days >= 30) return { bg: "bg-[#8B4513]", text: "text-white" };
  return { bg: "bg-white", text: "text-gray-700", border: "border border-gray-300" };
}

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
  const initials = getInitials(name);

  if (sobrietyDays != null) {
    const tier = getSobrietyClasses(sobrietyDays);
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold shadow-sm",
          tier.bg,
          tier.text,
          tier.border,
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

  const gradient = FALLBACK_PALETTE[hashName(name) % FALLBACK_PALETTE.length];
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
