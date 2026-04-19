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

export interface SobrietyAvatarTier {
  /** Tailwind background color class (solid, filled). */
  bg: string;
  /** Tailwind text color class that reads on `bg`. */
  text: string;
  /** Optional border class (used for the white 0–29 tier so the
   *  avatar remains visible on a white page background). */
  border?: string;
  /** Short label used for tooltip / aria-label. */
  label: string;
}

/**
 * Avatar tier that matches the sobriety chip color scale but uses
 * solid fills suitable for a filled avatar circle.
 *
 * Mirrors the thresholds in sobrietyTier() so a resident's avatar
 * color upgrades at the same boundaries the chip used to.
 */
export function sobrietyAvatarTier(
  sobrietyDate: string | null | undefined
): SobrietyAvatarTier | null {
  if (!sobrietyDate) return null;
  const start = new Date(sobrietyDate);
  if (Number.isNaN(start.getTime())) return null;
  const days = differenceInDays(new Date(), start);
  if (days < 0) return null;

  if (days >= 365) {
    const years = Math.max(1, differenceInYears(new Date(), start));
    return { bg: "bg-blue-600", text: "text-white", label: `${years}y+ sober` };
  }
  if (days >= 273) return { bg: "bg-green-600", text: "text-white", label: "9 mo sober" };
  if (days >= 182) return { bg: "bg-yellow-300", text: "text-gray-900", label: "6 mo sober" };
  if (days >= 90) return { bg: "bg-red-600", text: "text-white", label: "90 day sober" };
  if (days >= 60) return { bg: "bg-purple-600", text: "text-white", label: "60 day sober" };
  if (days >= 30) return { bg: "bg-[#8B4513]", text: "text-white", label: "30 day sober" };
  return {
    bg: "bg-white",
    text: "text-gray-700",
    border: "border border-gray-300",
    label: `${days} day${days === 1 ? "" : "s"} sober`,
  };
}

/**
 * Map a sobriety start date to the highest milestone tier reached and
 * return the chip's label + tailwind classes. Returns `null` when the
 * date is missing, in the future, or unparseable — callers should
 * render nothing in that case.
 *
 * Tiers (per product spec):
 *   0–29 days          → White
 *   30–59 days         → Brown (amber)
 *   60–89 days         → Purple
 *   90 days – 6 months → Red
 *   6 months – 8 mo    → Yellow
 *   9 months – 11 mo   → Green
 *   1 year+            → Blue
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
        "bg-green-50 border-green-200 text-green-700",
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
