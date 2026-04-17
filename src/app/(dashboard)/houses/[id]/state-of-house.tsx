"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StateOfHouseData } from "./state-of-house-data";

interface StateOfHouseProps {
  houseId: string;
  range: string;
  customStart: string;
  customEnd: string;
  rangeLabel: string;
  data: StateOfHouseData;
}

// Range options.
//
// "All Time" replaces the old "To Date" label so it’s obvious the column is
// unbounded — residents who joined long ago still appear. "Today" is a new
// explicit one-day window for "what happened today" questions, which is
// what users tend to read "to date" as meaning.
const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "all_time", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "month", label: "Monthly" },
  { value: "90d", label: "90 Days" },
  { value: "6mo", label: "6 Months" },
  { value: "1y", label: "1 Year" },
  { value: "custom", label: "Custom" },
];

function pct(n: number, d: number): string {
  if (d <= 0) return "—";
  return `${Math.round((100 * n) / d)}%`;
}

function avgOf<T>(items: T[], read: (x: T) => number): number | null {
  if (items.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const it of items) {
    const v = read(it);
    if (Number.isFinite(v)) {
      sum += v;
      count++;
    }
  }
  if (count === 0) return null;
  return sum / count;
}

function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleDateString() : "—";
}

export function StateOfHouseView({
  houseId,
  range,
  customStart,
  customEnd,
  rangeLabel,
  data,
}: StateOfHouseProps) {
  const base = `/houses/${houseId}`;

  const buildHref = (r: string) => {
    const params = new URLSearchParams();
    params.set("tab", "state");
    params.set("range", r);
    if (r === "custom" && customStart) params.set("start", customStart);
    if (r === "custom" && customEnd) params.set("end", customEnd);
    return `${base}?${params.toString()}`;
  };

  const meetingAvg = avgOf(data.meetingResponses, (r) => r.rating);
  const workAvg = avgOf(data.workResponses, (r) => r.rating);
  const wellbeingAvg = avgOf(data.wellbeingResponses, (r) => r.rating);

  const occPct = pct(data.census.occupiedBeds, data.census.totalBeds);

  return (
    <div className="space-y-6">
      {/* Range picker */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <Tabs value={range}>
            <TabsList className="w-full overflow-x-auto justify-start no-scrollbar">
              {RANGE_OPTIONS.map((opt) => (
                <TabsTrigger
                  key={opt.value}
                  value={opt.value}
                  nativeButton={false}
                  render={<Link href={buildHref(opt.value)} />}
                >
                  {opt.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {range === "custom" && (
            <form
              method="get"
              action={base}
              className="flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="tab" value="state" />
              <input type="hidden" name="range" value="custom" />
              <div className="space-y-1">
                <Label htmlFor="range-start" className="text-xs">
                  Start
                </Label>
                <Input
                  id="range-start"
                  name="start"
                  type="date"
                  defaultValue={customStart}
                  className="h-8 w-[150px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="range-end" className="text-xs">
                  End
                </Label>
                <Input
                  id="range-end"
                  name="end"
                  type="date"
                  defaultValue={customEnd}
                  className="h-8 w-[150px]"
                />
              </div>
              <button
                type="submit"
                className="h-8 rounded-md border bg-background px-3 text-sm hover:bg-muted"
              >
                Apply
              </button>
            </form>
          )}
          <p className="text-sm text-muted-foreground">
            Showing: <span className="font-medium">{rangeLabel}</span>
          </p>
        </CardContent>
      </Card>

      {/* Summary KPI strip */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Residents" value={data.census.currentResidents} />
        <Kpi
          label="Occupancy"
          value={`${data.census.occupiedBeds}/${data.census.totalBeds}`}
          sub={occPct}
        />
        <Kpi label="New" value={data.census.newResidents.length} />
        <Kpi
          label="Discharged"
          value={data.discharges.length}
          sub={
            data.voluntaryDepartures.length > 0
              ? `+${data.voluntaryDepartures.length} voluntary`
              : undefined
          }
        />
        <Kpi
          label="Incidents"
          value={data.incidents.total}
          highlight={
            data.incidents.bySeverity.critical +
              data.incidents.bySeverity.major >
            0
          }
        />
        <Kpi
          label="Out of stock"
          value={data.supplies.outOfStock}
          highlight={data.supplies.outOfStock > 0}
        />
      </div>

      {/* Occupancy & Census — expand to see bed-by-bed breakdown. */}
      <ExpandableSection
        title="Occupancy & Census"
        description="Current headcount plus bed-by-bed breakdown and move-ins during the selected period."
        summary={
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Current residents"
              value={data.census.currentResidents}
            />
            <Stat
              label="Occupied beds"
              value={`${data.census.occupiedBeds}/${data.census.totalBeds}`}
              sub={occPct}
            />
            <Stat label="Open beds" value={data.census.openBeds} />
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">
              Occupied beds ({data.census.occupiedBedDetails.length})
            </h4>
            {data.census.occupiedBedDetails.length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : (
              <ul className="space-y-2">
                {data.census.occupiedBedDetails.map((b) => (
                  <li
                    key={b.bedId}
                    className="rounded-md border bg-muted/20 p-3 text-sm flex items-center justify-between gap-2"
                  >
                    <span className="text-xs text-muted-foreground">
                      {b.roomName} / {b.bedLabel}
                    </span>
                    {b.isUnavailable ? (
                      <span className="font-medium text-amber-700">
                        Unavailable
                      </span>
                    ) : b.residentId ? (
                      <Link
                        href={`/residents/${b.residentId}`}
                        className="font-medium hover:underline"
                      >
                        {b.residentName}
                      </Link>
                    ) : (
                      <span className="font-medium">{b.residentName}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-medium">
              Open beds ({data.census.openBedDetails.length})
            </h4>
            {data.census.openBedDetails.length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : (
              <ul className="space-y-2">
                {data.census.openBedDetails.map((b) => (
                  <li
                    key={b.bedId}
                    className="rounded-md border bg-muted/20 p-3 text-sm"
                  >
                    <span className="font-medium">{b.roomName}</span>
                    <span className="text-muted-foreground"> / {b.bedLabel}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <NamedDateList
          title={`New residents in period (${data.census.newResidents.length})`}
          items={data.census.newResidents.map((r) => ({
            id: r.id,
            name: r.full_name,
            date: r.move_in_date,
          }))}
        />
      </ExpandableSection>

      {/* Discharges & Departures — click to expand the per-resident list. */}
      <ExpandableSection
        title="Discharges & Departures"
        description="Residents who left during the selected period. Reasons, when recorded, are shown."
        summary={
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Discharged" value={data.discharges.length} />
            <Stat
              label="Voluntary departures"
              value={data.voluntaryDepartures.length}
            />
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">
              Discharged ({data.discharges.length})
            </h4>
            {data.discharges.length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : (
              <ul className="space-y-2">
                {data.discharges.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-md border bg-muted/20 p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{r.full_name}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(r.move_out_date)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/70">
                        Reason:
                      </span>{" "}
                      {r.reason && r.reason.trim().length > 0 ? (
                        <span>{r.reason}</span>
                      ) : (
                        <span className="italic">Not recorded</span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-medium">
              Voluntary departures ({data.voluntaryDepartures.length})
            </h4>
            {data.voluntaryDepartures.length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : (
              <ul className="space-y-2">
                {data.voluntaryDepartures.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-md border bg-muted/20 p-3 text-sm flex items-center justify-between gap-2"
                  >
                    <span className="font-medium">{r.full_name}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(r.move_out_date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ExpandableSection>

      {/* Check-Ins — three separate expandable cards so each rating can be
          opened independently (per-resident detail with workplace for work). */}
      <ExpandableSection
        title="Meeting Satisfaction"
        description="Average self-rated meeting satisfaction from check-ins."
        summary={
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat
              label="Avg rating"
              value={meetingAvg != null ? meetingAvg.toFixed(1) : "—"}
            />
            <Stat label="Responses" value={data.meetingResponses.length} />
          </div>
        }
      >
        <RatingList
          title={`Per-resident (${data.meetingResponses.length})`}
          emptyText="No meeting-satisfaction ratings in this period."
          items={data.meetingResponses.map((r) => ({
            id: r.id,
            primary: r.name,
            secondary: null,
            rating: r.rating,
          }))}
        />
      </ExpandableSection>

      <ExpandableSection
        title="Work Satisfaction"
        description="Where each resident works and how they rated it this period."
        summary={
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat
              label="Avg rating"
              value={workAvg != null ? workAvg.toFixed(1) : "—"}
            />
            <Stat label="Responses" value={data.workResponses.length} />
          </div>
        }
      >
        <RatingList
          title={`Per-resident (${data.workResponses.length})`}
          emptyText="No work-satisfaction ratings in this period."
          items={data.workResponses.map((r) => ({
            id: r.id,
            primary: r.name,
            secondary: r.job ?? "Workplace not provided",
            rating: r.rating,
          }))}
        />
      </ExpandableSection>

      <ExpandableSection
        title="Well-being"
        description="Self-rated feeling about being a resident this period."
        summary={
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat
              label="Avg rating"
              value={wellbeingAvg != null ? wellbeingAvg.toFixed(1) : "—"}
            />
            <Stat label="Responses" value={data.wellbeingResponses.length} />
          </div>
        }
      >
        <RatingList
          title={`Per-resident (${data.wellbeingResponses.length})`}
          emptyText="No well-being ratings in this period."
          items={data.wellbeingResponses.map((r) => ({
            id: r.id,
            primary: r.name,
            secondary: null,
            rating: r.rating,
          }))}
        />
      </ExpandableSection>

      {/* Incidents — expandable */}
      <ExpandableSection
        title="Incidents"
        description="Reported incidents during the selected period."
        summary={
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Total" value={data.incidents.total} />
            <Stat
              label="Critical / Major"
              value={
                data.incidents.bySeverity.critical +
                data.incidents.bySeverity.major
              }
              sub={`critical ${data.incidents.bySeverity.critical} · major ${data.incidents.bySeverity.major}`}
              highlight={
                data.incidents.bySeverity.critical +
                  data.incidents.bySeverity.major >
                0
              }
            />
            <Stat label="Minor" value={data.incidents.bySeverity.minor} />
          </div>
        }
      >
        {data.incidents.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No incidents in this period.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.incidents.items.map((i) => (
              <li
                key={i.id}
                className="rounded-md border bg-muted/20 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium">{i.residentName}</span>
                    <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
                      {i.severity}
                      {i.category ? ` · ${i.category}` : ""}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(i.occurredAt)}
                  </span>
                </div>
                {i.description && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {i.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </ExpandableSection>

      {/* Demerits — expandable */}
      <ExpandableSection
        title="Demerits"
        description="Demerits issued during the selected period."
        summary={
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Demerits issued" value={data.demerits.issued} />
          </div>
        }
      >
        {data.demerits.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No demerits issued in this period.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.demerits.items.map((d) => (
              <li
                key={d.id}
                className="rounded-md border bg-muted/20 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium">{d.residentName}</span>
                    {d.category && (
                      <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
                        {d.category}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(d.createdAt)}
                  </span>
                </div>
                {d.reason && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </ExpandableSection>

      {/* Restrictions — expandable */}
      <ExpandableSection
        title="Restrictions"
        description="Restriction activity during the selected period."
        summary={
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Active" value={data.restrictions.active} />
            <Stat label="Lifted" value={data.restrictions.lifted} />
          </div>
        }
      >
        {data.restrictions.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No restriction activity in this period.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.restrictions.items.map((r) => (
              <li
                key={r.id}
                className="rounded-md border bg-muted/20 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium">{r.residentName}</span>
                    <span
                      className={`ml-2 text-xs uppercase tracking-wide ${
                        r.isActive
                          ? "text-amber-700"
                          : "text-muted-foreground"
                      }`}
                    >
                      {r.isActive ? "Active" : "Lifted"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(r.startDate)}
                    {r.endDate ? ` → ${fmtDate(r.endDate)}` : ""}
                  </span>
                </div>
                {r.description && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </ExpandableSection>

      {/* Supplies — expandable */}
      <ExpandableSection
        title="Supplies"
        description="Per-house supply stock status (current, not range-filtered)."
        summary={
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="In stock" value={data.supplies.inStock} />
            <Stat
              label="Out of stock"
              value={data.supplies.outOfStock}
              highlight={data.supplies.outOfStock > 0}
            />
          </div>
        }
      >
        {data.supplies.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No supplies tracked for this house yet.
          </p>
        ) : (
          <>
            {data.supplies.outOfStock > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
                <span className="font-medium">Needs restock:</span>{" "}
                {data.supplies.outOfStockNames.join(", ")}
              </div>
            )}
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {data.supplies.items.map((s) => (
                <li
                  key={s.id}
                  className="rounded-md border bg-muted/20 px-3 py-2 text-sm flex items-center justify-between gap-2"
                >
                  <span className="font-medium">{s.name}</span>
                  <span
                    className={
                      "text-xs font-medium uppercase tracking-wide " +
                      (s.isInStock
                        ? "text-emerald-700"
                        : "text-destructive")
                    }
                  >
                    {s.isInStock ? "In stock" : "Out of stock"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </ExpandableSection>
    </div>
  );
}

// ─── Layout primitives ─────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function ExpandableSection({
  title,
  description,
  summary,
  children,
}: {
  title: string;
  description?: string;
  summary: React.ReactNode;
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
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-1.5">
              {title}
              <span className="text-muted-foreground">
                {open ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </span>
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
        </CardHeader>
      </button>
      <CardContent className="space-y-4">
        {summary}
        {open && <div className="pt-2 border-t">{children}</div>}
      </CardContent>
    </Card>
  );
}

function Kpi({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-destructive/40" : ""}>
      <CardContent className="py-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-semibold mt-0.5">{value}</p>
        {sub && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        highlight ? "border-destructive/40 bg-destructive/5" : "bg-muted/20"
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function NamedDateList({
  title,
  items,
}: {
  title: string;
  items: { id: string; name: string; date: string | null }[];
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-sm"
            >
              <span className="font-medium">{it.name}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {fmtDate(it.date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RatingList({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: {
    id: string;
    primary: string;
    secondary: string | null;
    rating: number;
  }[];
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{it.primary}</p>
                {it.secondary && (
                  <p className="text-xs text-muted-foreground truncate">
                    {it.secondary}
                  </p>
                )}
              </div>
              <span className="text-sm font-semibold whitespace-nowrap">
                {it.rating}/10
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
