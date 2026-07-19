import {
  differenceInDays,
  differenceInMonths,
  differenceInYears,
  format,
} from "date-fns";

export interface Milestone {
  label: string;
  days: number;
  reached: boolean;
  date: string | null;
}

const MILESTONE_DEFINITIONS = [
  { label: "30 Days", days: 30 },
  { label: "60 Days", days: 60 },
  { label: "90 Days", days: 90 },
  { label: "6 Months", days: 182 },
  { label: "9 Months", days: 273 },
  { label: "1 Year", days: 365 },
];

export function calculateMilestones(sobrietyDate: string): Milestone[] {
  const start = new Date(sobrietyDate);
  const now = new Date();
  const daysSober = differenceInDays(now, start);

  return MILESTONE_DEFINITIONS.map((m) => {
    const milestoneDate = new Date(start);
    milestoneDate.setDate(milestoneDate.getDate() + m.days);

    return {
      label: m.label,
      days: m.days,
      reached: daysSober >= m.days,
      date: format(milestoneDate, "MMM d, yyyy"),
    };
  });
}

/**
 * Whole days between now and the given sobriety date. Floored at 0 —
 * a future sobriety date (start date hasn't arrived yet) reports 0
 * days rather than a negative number. Callers that need to know
 * whether the date is in the future should use `isSobrietyDateFuture`.
 */
export function getDaysSober(sobrietyDate: string): number {
  const raw = differenceInDays(new Date(), new Date(sobrietyDate));
  return raw < 0 ? 0 : raw;
}

/**
 * True when the stored sobriety date is after today. Used by UI to
 * show "Starts MM/DD/YYYY" in place of a days-sober counter.
 */
export function isSobrietyDateFuture(sobrietyDate: string): boolean {
  return differenceInDays(new Date(), new Date(sobrietyDate)) < 0;
}

export function getSobrietySummary(sobrietyDate: string): string {
  const start = new Date(sobrietyDate);
  const now = new Date();
  const years = differenceInYears(now, start);
  const months = differenceInMonths(now, start) % 12;
  const days = differenceInDays(now, start);

  if (years > 0) {
    return `${years}y ${months}m`;
  }
  if (months > 0) {
    return `${months}m ${days % 30}d`;
  }
  return `${days}d`;
}

export function getNextMilestone(
  sobrietyDate: string
): Milestone | null {
  const milestones = calculateMilestones(sobrietyDate);
  return milestones.find((m) => !m.reached) ?? null;
}
