"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Tabs value={range}>
          <TabsList className="flex-wrap h-auto">
            {RANGE_OPTIONS.map((opt) => (
              <TabsTrigger key={opt.value} value={opt.value} render={<Link href={buildHref(opt.value)} />}>
                {opt.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {range === "custom" && (
          <form
            method="get"
            action={base}
            className="flex flex-wrap items-end gap-2 pt-2"
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
        <p className="text-sm text-muted-foreground">Showing: {rangeLabel}</p>
      </div>

      {/* 1. Occupancy / Census */}
      <Section title="1. Occupancy & Census">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Current residents" value={data.census.currentResidents} />
          <Metric
            label="Occupied beds"
            value={`${data.census.occupiedBeds}/${data.census.totalBeds}`}
            sub={pct(data.census.occupiedBeds, data.census.totalBeds)}
          />
          <Metric label="Open beds" value={data.census.openBeds} />
        </div>
        <ListBlock
          title={`New residents in period (${data.census.newResidents.length})`}
          empty="None"
          items={data.census.newResidents.map((r) => ({
            id: r.id,
            primary: r.full_name,
            secondary: r.move_in_date
              ? new Date(r.move_in_date).toLocaleDateString()
              : undefined,
          }))}
        />
      </Section>

      {/* 2. Discharges & Departures */}
      <Section title="2. Discharges & Departures">
        <div className="grid gap-3 sm:grid-cols-2">
          <ListBlock
            title={`Discharged (${data.discharges.length})`}
            empty="None"
            items={data.discharges.map((r) => ({
              id: r.id,
              primary: r.full_name,
              secondary: [
                r.move_out_date
                  ? new Date(r.move_out_date).toLocaleDateString()
                  : null,
                r.reason,
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
          <ListBlock
            title={`Voluntary departures (${data.voluntaryDepartures.length})`}
            empty="None"
            items={data.voluntaryDepartures.map((r) => ({
              id: r.id,
              primary: r.full_name,
              secondary: r.move_out_date
                ? new Date(r.move_out_date).toLocaleDateString()
                : undefined,
            }))}
          />
        </div>
      </Section>

      {/* 3. Check-Ins & Activity */}
      <Section title="3. Check-Ins & Activity">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Check-ins sent"
            value={data.checkIns.sent}
          />
          <Metric
            label="Check-ins submitted"
            value={`${data.checkIns.submitted}`}
            sub={pct(data.checkIns.submitted, data.checkIns.sent)}
          />
          <Metric
            label="Avg meeting satisfaction"
            value={meetingAvg != null ? meetingAvg.toFixed(1) : "—"}
            sub={
              data.meetingSatisfaction.length > 0
                ? `${data.meetingSatisfaction.length} responses`
                : undefined
            }
          />
          <Metric
            label="Avg work satisfaction"
            value={workAvg != null ? workAvg.toFixed(1) : "—"}
          />
          <Metric
            label="Avg well-being"
            value={wellbeingAvg != null ? wellbeingAvg.toFixed(1) : "—"}
          />
        </div>
      </Section>

      {/* 4. Incidents */}
      <Section title="4. Incidents">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Total" value={data.incidents.total} />
          <Metric
            label="Critical / Major"
            value={data.incidents.bySeverity.critical + data.incidents.bySeverity.major}
            sub={`critical ${data.incidents.bySeverity.critical} · major ${data.incidents.bySeverity.major}`}
          />
          <Metric label="Minor" value={data.incidents.bySeverity.minor} />
        </div>
      </Section>

      {/* 5. Discipline */}
      <Section title="5. Discipline">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Demerits issued" value={data.demerits.issued} />
          <Metric label="Worked off" value={data.demerits.workedOff} />
          <Metric
            label="Active restrictions"
            value={data.restrictions.active}
            sub={`lifted ${data.restrictions.lifted}`}
          />
        </div>
      </Section>

      {/* 6. Supplies */}
      <Section title="6. Supplies">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Tracked items" value={data.supplies.total} />
          <Metric label="In stock" value={data.supplies.inStock} />
          <Metric
            label="Out of stock"
            value={data.supplies.outOfStock}
            highlight={data.supplies.outOfStock > 0}
          />
        </div>
        {data.supplies.outOfStockNames.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Needs restock: {data.supplies.outOfStockNames.join(", ")}
          </p>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Metric({
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
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ListBlock({
  title,
  items,
  empty,
}: {
  title: string;
  items: { id: string; primary: string; secondary?: string }[];
  empty: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-1">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-center justify-between text-sm border-b last:border-0 py-1"
            >
              <span>{it.primary}</span>
              {it.secondary && (
                <Badge variant="outline" className="text-[10px]">
                  {it.secondary}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
