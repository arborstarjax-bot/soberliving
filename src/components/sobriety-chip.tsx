import { differenceInDays, differenceInYears } from "date-fns";
import { formatDateOnly } from "@/lib/timezone";

export interface SobrietyChipProps {
  sobrietyDate: string | null | undefined;
  className?: string;
}

interface TierStyle {
  label: string;
  classes: string;
}

/**
 * Map a sobriety start date to the highest milestone tier reached and
 * return the chip's label + tailwind classes. Returns `null` when the
 * date is missing, in the future, or unparseable — callers should
 * render nothing in that case.
 *
 * Tiers (per product spec):
 *   0–29 days  → White
 *   30 days    → Brown (stone/amber)
 *   60 days    → Purple
 *   90 days    → Red
 *   6 months   → Yellow
 *   9 months   → Green
 *   1 year+    → Blue
 */
export function sobrietyTier(sobrietyDate: string): TierStyle | null {
  const start = new Date(sobrietyDate);
  if (Number.isNaN(start.getTime())) return null;
  const days = differenceInDays(new Date(), start);
  if (days < 0) return null;

  if (days >= 365) {
    const years = Math.max(1, differenceInYears(new Date(), start));
    return {
      label: `${years}y+ sober`,
      classes:
        "bg-blue-50 border-blue-200 text-blue-700",
    };
  }
  if (days >= 273) {
    return {
      label: "9 mo sober",
      classes:
        "bg-emerald-50 border-emerald-200 text-emerald-700",
    };
  }
  if (days >= 182) {
    return {
      label: "6 mo sober",
      classes:
        "bg-yellow-50 border-yellow-300 text-yellow-800",
    };
  }
  if (days >= 90) {
    return {
      label: "90 day sober",
      classes:
        "bg-red-50 border-red-200 text-red-700",
    };
  }
  if (days >= 60) {
    return {
      label: "60 day sober",
      classes:
        "bg-purple-50 border-purple-200 text-purple-700",
    };
  }
  if (days >= 30) {
    return {
      label: "30 day sober",
      classes:
        "bg-amber-100 border-amber-300 text-amber-900",
    };
  }
  return {
    label: `${days} day${days === 1 ? "" : "s"} sober`,
    classes: "bg-white border-gray-300 text-gray-700",
  };
}

/**
 * Small pill shown next to a resident's name on bulletin / ride share
 * posts to surface their current sobriety milestone. Renders nothing
 * when no date is set (non-residents, future dates, bad data) so it
 * can be dropped in unconditionally.
 */
export function SobrietyChip({ sobrietyDate, className }: SobrietyChipProps) {
  if (!sobrietyDate) return null;
  const tier = sobrietyTier(sobrietyDate);
  if (!tier) return null;
  return (
    <span
      title={`Sober since ${formatDateOnly(sobrietyDate)}`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${tier.classes}${className ? ` ${className}` : ""}`}
    >
      {tier.label}
    </span>
  );
}
