"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Home,
  Users,
  LogOut,
  Moon,
  UserPlus,
  ListX,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { formatDateOnly, formatInAppTz } from "@/lib/timezone";

// Admin / Manager dashboard landing grid.
//
// Six resident-focused cards. The first two (Houses, Active
// Residents) are plain navigation counts — click the card, go to the
// corresponding list page. The other four (Signed Out, On Overnight,
// New Intakes, Missed Chores This Week) expand in place to show the
// specific people/events behind the number so staff don't have to
// drill into a secondary page just to answer "who?".
//
// Anything operational (chore setup, user management, demerit log,
// incidents, etc.) lives behind the sidebar nav on purpose — this
// page is meant to answer "what is happening with the residents right
// now" at a glance, not be another catch-all hub.

export interface SignedOutItem {
  id: string;
  resident_id: string;
  resident_name: string;
  destination: string;
  time_out: string;
  house_name: string | null;
}

export interface OnOvernightItem {
  id: string;
  resident_id: string;
  resident_name: string;
  departure_date: string;
  expected_return_date: string;
  reason: string | null;
  house_name: string | null;
}

export interface NewIntakeItem {
  id: string;
  full_name: string;
  move_in_date: string;
  house_name: string | null;
}

export interface MissedChoreItem {
  id: string;
  resident_name: string;
  chore_name: string;
  house_name: string | null;
  sign_off_date: string;
}

interface Props {
  houseCount: number;
  activeResidentCount: number;
  signedOut: SignedOutItem[];
  onOvernight: OnOvernightItem[];
  newIntakes: NewIntakeItem[];
  missedChores: MissedChoreItem[];
}

export function DashboardGrid({
  houseCount,
  activeResidentCount,
  signedOut,
  onOvernight,
  newIntakes,
  missedChores,
}: Props) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      <NavCard
        label="Houses"
        value={houseCount}
        href="/houses"
        icon={<Home className="h-5 w-5" />}
      />
      <NavCard
        label="Active Residents"
        value={activeResidentCount}
        href="/residents"
        icon={<Users className="h-5 w-5" />}
      />
      <ExpandCard
        label="Signed Out"
        value={signedOut.length}
        icon={<LogOut className="h-5 w-5" />}
        href="/sign-out-sheet"
        hrefLabel="View sign-out sheet"
        emptyText="Nobody is currently signed out."
      >
        <ul className="divide-y">
          {signedOut.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <Link
                  href={`/residents/${s.resident_id}`}
                  className="text-sm font-medium hover:underline truncate block"
                >
                  {s.resident_name}
                </Link>
                <p className="text-xs text-muted-foreground truncate">
                  {s.destination}
                  {s.house_name ? ` · ${s.house_name}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                since {formatInAppTz(s.time_out, { hour: "numeric", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      </ExpandCard>
      <ExpandCard
        label="On Overnight"
        value={onOvernight.length}
        icon={<Moon className="h-5 w-5" />}
        href="/leave-requests"
        hrefLabel="View leave requests"
        emptyText="Nobody is out on an approved overnight."
      >
        <ul className="divide-y">
          {onOvernight.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <Link
                  href={`/residents/${r.resident_id}`}
                  className="text-sm font-medium hover:underline truncate block"
                >
                  {r.resident_name}
                </Link>
                <p className="text-xs text-muted-foreground truncate">
                  {formatDateOnly(r.departure_date, { month: "short", day: "numeric" })}
                  {" – "}
                  {formatDateOnly(r.expected_return_date, { month: "short", day: "numeric" })}
                  {r.house_name ? ` · ${r.house_name}` : ""}
                </p>
              </div>
              {r.reason && (
                <span className="shrink-0 text-xs text-muted-foreground max-w-[40%] truncate">
                  {r.reason}
                </span>
              )}
            </li>
          ))}
        </ul>
      </ExpandCard>
      <ExpandCard
        label="New Intakes"
        value={newIntakes.length}
        icon={<UserPlus className="h-5 w-5" />}
        href="/residents"
        hrefLabel="View all residents"
        emptyText="No new move-ins in the last 30 days."
      >
        <ul className="divide-y">
          {newIntakes.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <Link
                  href={`/residents/${r.id}`}
                  className="text-sm font-medium hover:underline truncate block"
                >
                  {r.full_name}
                </Link>
                {r.house_name && (
                  <p className="text-xs text-muted-foreground truncate">
                    {r.house_name}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDateOnly(r.move_in_date, { month: "short", day: "numeric" })}
              </span>
            </li>
          ))}
        </ul>
      </ExpandCard>
      <ExpandCard
        label="Missed Chores"
        sublabel="This week"
        value={missedChores.length}
        icon={<ListX className="h-5 w-5" />}
        href="/chores"
        hrefLabel="View chores"
        emptyText="Nothing was missed this week — nice."
      >
        <ul className="divide-y">
          {missedChores.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.resident_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {c.chore_name}
                  {c.house_name ? ` · ${c.house_name}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDateOnly(c.sign_off_date, { month: "short", day: "numeric" })}
              </span>
            </li>
          ))}
        </ul>
      </ExpandCard>
    </div>
  );
}

// ─── Primitives ─────────────────────────────

function NavCard({
  label,
  value,
  href,
  icon,
}: {
  label: string;
  value: number;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="block">
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {label}
          </CardTitle>
          <span className="text-muted-foreground">{icon}</span>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-3xl font-bold tabular-nums">{value}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function ExpandCard({
  label,
  sublabel,
  value,
  icon,
  href,
  hrefLabel,
  emptyText,
  children,
}: {
  label: string;
  sublabel?: string;
  value: number;
  icon: React.ReactNode;
  href: string;
  hrefLabel: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left"
        aria-expanded={open}
      >
        <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
            {label}
            <span className="text-muted-foreground/60">
              {open ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </span>
          </CardTitle>
          <span className="text-muted-foreground">{icon}</span>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold tabular-nums">{value}</p>
            {sublabel && (
              <span className="text-xs text-muted-foreground">{sublabel}</span>
            )}
          </div>
        </CardContent>
      </button>
      {open && (
        <CardContent className="pt-0">
          {value === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            children
          )}
          <div className="mt-3 pt-3 border-t">
            <Link
              href={href}
              className="text-xs font-medium text-primary hover:underline"
            >
              {hrefLabel} →
            </Link>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
