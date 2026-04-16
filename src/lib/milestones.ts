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

export function getDaysSober(sobrietyDate: string): number {
  return differenceInDays(new Date(), new Date(sobrietyDate));
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
