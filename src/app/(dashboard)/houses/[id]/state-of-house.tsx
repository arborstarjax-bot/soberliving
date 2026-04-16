"use client";

import Link from "next/link";
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

const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "to_date", label: "To Date" },
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

function avg(nums: number[]): number | null {
  const clean = nums.filter((n) => Number.isFinite(n));
  if (clean.length === 0) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
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

  const meetingAvg = avg(data.meetingSatisfaction);
  const workAvg = avg(data.workSatisfaction);
  const wellbeingAvg = avg(data.wellbeing);

  const occPct = pct(data.census.occupiedBeds, data.census.totalBeds);
  const submittedPct = pct(data.checkIns.submitted, data.checkIns.sent);

  return (
    <div className="space-y-6">
      {/* Range picker */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <Tabs value={range}>
            <TabsList className="flex-wrap h-auto">
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

      {/* Occupancy & Census */}
      <SectionCard
        title="Occupancy & Census"
        description="Current headcount and move-ins during the selected period."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Current residents" value={data.census.currentResidents} />
          <Stat
            label="Occupied beds"
            value={`${data.census.occupiedBeds}/${data.census.totalBeds}`}
            sub={occPct}
          />
          <Stat label="Open beds" value={data.census.openBeds} />
        </div>
        <NamedDateList
          title={`New residents in period (${data.census.newResidents.length})`}
          items={data.census.newResidents.map((r) => ({
            id: r.id,
            name: r.full_name,
            date: r.move_in_date,
          }))}
        />
      </SectionCard>

      {/* Discharges & Departures */}
      <SectionCard
        title="Discharges & Departures"
        description="Residents who left during the selected period. Reasons, when recorded, are shown."
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
      </SectionCard>

      {/* Check-ins & engagement */}
      <SectionCard
        title="Check-Ins & Engagement"
        description="Monthly check-in volume and average resident self-ratings."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Check-ins sent" value={data.checkIns.sent} />
          <Stat
            label="Submitted"
            value={data.checkIns.submitted}
            sub={submittedPct}
          />
          <Stat
            label="Avg meeting satisfaction"
            value={meetingAvg != null ? meetingAvg.toFixed(1) : "—"}
            sub={
              data.meetingSatisfaction.length > 0
                ? `${data.meetingSatisfaction.length} responses`
                : undefined
            }
          />
          <Stat
            label="Avg work satisfaction"
            value={workAvg != null ? workAvg.toFixed(1) : "—"}
            sub={
              data.workSatisfaction.length > 0
                ? `${data.workSatisfaction.length} responses`
                : undefined
            }
          />
          <Stat
            label="Avg well-being"
            value={wellbeingAvg != null ? wellbeingAvg.toFixed(1) : "—"}
            sub={
              data.wellbeing.length > 0
                ? `${data.wellbeing.length} responses`
                : undefined
            }
          />
        </div>
      </SectionCard>

      {/* Incidents */}
      <SectionCard
        title="Incidents"
        description="Reported incidents during the selected period."
      >
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
      </SectionCard>

      {/* Discipline */}
      <SectionCard
        title="Discipline"
        description="Demerits and restrictions activity."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Demerits issued" value={data.demerits.issued} />
          <Stat label="Worked off" value={data.demerits.workedOff} />
          <Stat
            label="Active restrictions"
            value={data.restrictions.active}
            sub={`lifted ${data.restrictions.lifted}`}
          />
        </div>
      </SectionCard>

      {/* Supplies */}
      <SectionCard
        title="Supplies"
        description="Per-house supply stock status (current, not range-filtered)."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Tracked items" value={data.supplies.total} />
          <Stat label="In stock" value={data.supplies.inStock} />
          <Stat
            label="Out of stock"
            value={data.supplies.outOfStock}
            highlight={data.supplies.outOfStock > 0}
          />
        </div>
        {data.supplies.outOfStockNames.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
            <span className="font-medium">Needs restock:</span>{" "}
            {data.supplies.outOfStockNames.join(", ")}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

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
