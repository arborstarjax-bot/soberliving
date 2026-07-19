import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_TIMEZONE,
  endOfDayInTz,
  getHouseFirstOfMonth,
  getHouseToday,
  startOfDayInTz,
} from "@/lib/timezone";

export interface StateOfHouseData {
  census: {
    currentResidents: number;
    totalBeds: number;
    occupiedBeds: number;
    openBeds: number;
    newResidents: {
      id: string;
      full_name: string;
      move_in_date: string | null;
    }[];
    // Per-bed detail for the Occupancy expansion. Each occupied bed lists
    // the resident; each open bed is a room/label pair so staff can see
    // exactly which beds are free.
    occupiedBedDetails: {
      bedId: string;
      roomName: string;
      bedLabel: string;
      residentName: string;
      residentId: string | null;
      // True when the bed is marked Not Available (no resident, but still
      // held off the available pool). These render as "Bed N - Unavailable"
      // in the Occupied list.
      isUnavailable: boolean;
    }[];
    openBedDetails: {
      bedId: string;
      roomName: string;
      bedLabel: string;
    }[];
  };
  discharges: {
    id: string;
    full_name: string;
    move_out_date: string | null;
    reason: string | null;
  }[];
  voluntaryDepartures: {
    id: string;
    full_name: string;
    move_out_date: string | null;
  }[];
  meetingResponses: { id: string; name: string; rating: number }[];
  workResponses: {
    id: string;
    name: string;
    job: string | null;
    rating: number;
  }[];
  wellbeingResponses: { id: string; name: string; rating: number }[];
  incidents: {
    total: number;
    bySeverity: { minor: number; major: number; critical: number };
    items: {
      id: string;
      residentName: string;
      severity: string;
      category: string | null;
      description: string | null;
      occurredAt: string | null;
    }[];
  };
  demerits: {
    issued: number;
    items: {
      id: string;
      residentName: string;
      reason: string | null;
      category: string | null;
      createdAt: string | null;
    }[];
  };
  restrictions: {
    active: number;
    lifted: number;
    items: {
      id: string;
      residentName: string;
      description: string | null;
      startDate: string | null;
      endDate: string | null;
      isActive: boolean;
    }[];
  };
  supplies: {
    total: number;
    inStock: number;
    outOfStock: number;
    outOfStockNames: string[];
    items: {
      id: string;
      name: string;
      isInStock: boolean;
    }[];
  };
}

export interface DateRange {
  startIso: string | null; // null = no lower bound (all-time "To Date")
  endIso: string; // inclusive end, ISO date
  label: string;
  // Timezone used when the range was built. Threaded into isIn() so that
  // date-only record values (YYYY-MM-DD) are normalized against the same
  // local midnight the range boundaries were computed from. Without this,
  // a resident who moved in on the boundary day in a PT house would be
  // dropped because UTC midnight (00:00Z) is before PT midnight (07:00Z).
  timezone: string;
}

export function resolveRange(
  range: string,
  customStart: string,
  customEnd: string,
  timezone: string = DEFAULT_TIMEZONE
): DateRange {
  const now = new Date();
  const endIso = now.toISOString();

  switch (range) {
    case "today": {
      // Midnight in the HOUSE's timezone, not the server's. Without this,
      // a house in PT would include late-yesterday-evening records in
      // "Today" (since midnight UTC is 5–8pm local) and drop early-morning
      // records that haven't reached UTC midnight yet.
      const todayStr = getHouseToday(timezone);
      return {
        startIso: startOfDayInTz(todayStr, timezone),
        endIso,
        label: "Today",
        timezone,
      };
    }
    case "month": {
      const firstOfMonth = getHouseFirstOfMonth(timezone);
      // Label uses the house's local month/year so e.g. PT houses
      // crossing midnight UTC late on the 31st still read the correct
      // month name.
      const labelDate = new Date(`${firstOfMonth}T12:00:00Z`);
      const monthLabel = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        month: "long",
        year: "numeric",
      }).format(labelDate);
      return {
        startIso: startOfDayInTz(firstOfMonth, timezone),
        endIso,
        label: `${monthLabel} to date`,
        timezone,
      };
    }
    case "90d": {
      // Relative durations (last N days/months/years) are anchored at
      // "now" and don't need timezone adjustment — the window is the
      // same whether we measure it in UTC or local time.
      const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return {
        startIso: start.toISOString(),
        endIso,
        label: "Last 90 days",
        timezone,
      };
    }
    case "6mo": {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      return {
        startIso: start.toISOString(),
        endIso,
        label: "Last 6 months",
        timezone,
      };
    }
    case "1y": {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      return {
        startIso: start.toISOString(),
        endIso,
        label: "Last 12 months",
        timezone,
      };
    }
    case "custom": {
      // customStart / customEnd come in as "YYYY-MM-DD" date-only strings
      // from the <input type="date"> picker. Interpret them as local dates
      // in the house's timezone so a user picking "April 16" gets their
      // full calendar day in their own timezone, not server UTC.
      const startIso = customStart
        ? startOfDayInTz(customStart, timezone)
        : null;
      const endIso = customEnd
        ? endOfDayInTz(customEnd, timezone)
        : endOfDayInTz(getHouseToday(timezone), timezone);
      return {
        startIso,
        endIso,
        label: `${
          customStart || "All time"
        } – ${customEnd || getHouseToday(timezone)}`,
        timezone,
      };
    }
    case "all_time":
    case "to_date":
    default:
      // "to_date" kept as a synonym so any bookmarked or old-format URLs
      // (from before the rename) still resolve to the same all-time view.
      return { startIso: null, endIso, label: "All time", timezone };
  }
}

function isIn(dateStr: string | null | undefined, range: DateRange): boolean {
  if (!dateStr) return false;
  // Normalize date-only strings ("YYYY-MM-DD") using the house's local
  // midnight, not UTC midnight. The range boundaries (range.startIso /
  // range.endIso) are built via startOfDayInTz / endOfDayInTz using the
  // house timezone, so a date-only value must be anchored in the same
  // timezone or the boundary comparison is off by the UTC offset. E.g.
  // for a PT house on 2026-04-16 the "Today" range starts at
  // 2026-04-16T07:00:00.000Z. Normalizing a move_in_date of "2026-04-16"
  // to UTC midnight (00:00:00Z) would be < 07:00:00Z and the record
  // would silently disappear from the report.
  const normalized =
    dateStr.length === 10 ? startOfDayInTz(dateStr, range.timezone) : dateStr;
  if (range.startIso && normalized < range.startIso) return false;
  if (normalized > range.endIso) return false;
  return true;
}

export async function loadStateOfHouseData(
  houseId: string,
  range: DateRange
): Promise<StateOfHouseData> {
  const supabase = await createClient();

  const [
    residentsRes,
    roomsRes,
    incidentsRes,
    demeritsRes,
    restrictionsRes,
    suppliesRes,
    checkInResponsesRes,
  ] = await Promise.all([
    supabase
      .from("residents")
      .select(
        "id, full_name, status, move_in_date, move_out_date, discharge_reason, discharge_is_voluntary"
      )
      .eq("house_id", houseId),
    supabase
      .from("rooms")
      // Include room.name and a resident join on bed_assignments so the
      // Occupancy expansion can show "Room X / Bed Y — Resident Name" with
      // a link to each resident's detail page.
      .select(
        "id, name, beds(id, is_active, label, bed_assignments(end_date, resident:residents(id, full_name)))"
      )
      .eq("house_id", houseId)
      .eq("is_active", true),
    supabase
      .from("incidents")
      .select(
        "id, severity, category, description, occurred_at, created_at, residents(full_name)"
      )
      .eq("house_id", houseId),
    supabase
      // Filter by the demerit's own house_id (not the resident's current
      // house) so demerits stay attached to the house where they were
      // issued — otherwise transferring a resident silently moves their
      // disciplinary history between houses' State of the House reports.
      .from("demerits")
      .select(
        "id, status, reason, category, created_at, worked_off_at, residents(full_name)"
      )
      .eq("house_id", houseId),
    supabase
      // Same reasoning as demerits above — restrictions carry their own
      // house_id that reflects where they were issued.
      .from("restrictions")
      .select(
        "id, is_active, description, start_date, end_date, created_at, residents(full_name)"
      )
      .eq("house_id", houseId),
    supabase
      .from("supply_items")
      .select("id, name, is_in_stock")
      .eq("house_id", houseId),
    supabase
      .from("check_in_responses")
      .select(
        "id, resident_id, status, created_at, completed_at, form_data, residents(full_name)"
      )
      .eq("house_id", houseId),
  ]);

  // Census
  type ResidentRow = {
    id: string;
    full_name: string;
    status: string | null;
    move_in_date: string | null;
    move_out_date: string | null;
    discharge_reason: string | null;
    discharge_is_voluntary: boolean | null;
  };
  const residents = (residentsRes.data ?? []) as unknown as ResidentRow[];
  const currentResidents = residents.filter((r) => r.status === "active");
  const newResidentsInRange = currentResidents.filter((r) =>
    isIn(r.move_in_date, range)
  );

  // Beds
  type RawBedAssignment = {
    end_date: string | null;
    // Supabase returns the aliased join as `resident` (see the rooms select
    // above). Keep it as an object | array to handle both cardinalities.
    resident?:
      | { id?: string; full_name?: string }
      | { id?: string; full_name?: string }[]
      | null;
  };
  type RawBed = {
    id: string;
    is_active: boolean;
    label: string;
    bed_assignments: RawBedAssignment[];
  };
  type RawRoom = { id: string; name: string | null; beds: RawBed[] };
  const rooms = (roomsRes.data ?? []) as unknown as RawRoom[];
  let totalBeds = 0;
  let occupiedBeds = 0;
  const occupiedBedDetails: StateOfHouseData["census"]["occupiedBedDetails"] =
    [];
  const openBedDetails: StateOfHouseData["census"]["openBedDetails"] = [];
  const cleanBedLabel = (label: string): string =>
    label
      .replace(/\s*\[Not Available\]$/, "")
      .replace(/\s*\[Empty\]$/, "");
  for (const room of rooms) {
    const roomName = room.name ?? "Room";
    for (const bed of room.beds ?? []) {
      if (!bed.is_active) continue;
      totalBeds++;
      const activeAssignment = (bed.bed_assignments ?? []).find(
        (ba) => !ba.end_date
      );
      const isUnavailable =
        bed.label.endsWith(" [Not Available]") ||
        bed.label.endsWith(" [Empty]");
      const displayLabel = cleanBedLabel(bed.label);
      if (activeAssignment) {
        occupiedBeds++;
        const resRel = activeAssignment.resident;
        const res = Array.isArray(resRel) ? resRel[0] : resRel;
        occupiedBedDetails.push({
          bedId: bed.id,
          roomName,
          bedLabel: displayLabel,
          residentName: res?.full_name ?? "Unknown resident",
          residentId: res?.id ?? null,
          isUnavailable: false,
        });
      } else if (isUnavailable) {
        // Not Available beds count as occupied per house policy: they
        // hold the bed off the available pool even though no resident
        // is assigned. They show up in the Occupied list as
        // "Bed N - Unavailable".
        occupiedBeds++;
        occupiedBedDetails.push({
          bedId: bed.id,
          roomName,
          bedLabel: displayLabel,
          residentName: "Unavailable",
          residentId: null,
          isUnavailable: true,
        });
      } else {
        openBedDetails.push({
          bedId: bed.id,
          roomName,
          bedLabel: displayLabel,
        });
      }
    }
  }
  const openBeds = totalBeds - occupiedBeds;

  // Discharges / departures (within range). Split by the explicit
  // `discharge_is_voluntary` flag set on the Discharge dialog.
  const dischargedInRange = residents.filter(
    (r) => r.status === "discharged" && isIn(r.move_out_date, range)
  );
  const discharges = dischargedInRange
    .filter((r) => !r.discharge_is_voluntary)
    .map((r) => ({
      id: r.id,
      full_name: r.full_name,
      move_out_date: r.move_out_date,
      reason: r.discharge_reason ?? null,
    }));
  const voluntaryDepartures = dischargedInRange
    .filter((r) => r.discharge_is_voluntary === true)
    .map((r) => ({
      id: r.id,
      full_name: r.full_name,
      move_out_date: r.move_out_date,
    }));

  // Incidents
  type RawIncident = {
    id: string;
    severity: string | null;
    category: string | null;
    description: string | null;
    occurred_at: string | null;
    created_at: string | null;
    residents?: { full_name?: string } | { full_name?: string }[] | null;
  };
  const incidentsRaw = ((incidentsRes.data ?? []) as unknown as RawIncident[]).filter(
    (i) => isIn(i.occurred_at ?? i.created_at, range)
  );
  const incidentsBySeverity = {
    minor: incidentsRaw.filter((i) => i.severity === "minor").length,
    major: incidentsRaw.filter((i) => i.severity === "major").length,
    critical: incidentsRaw.filter((i) => i.severity === "critical").length,
  };
  const pickName = (
    rel: { full_name?: string } | { full_name?: string }[] | null | undefined
  ): string => {
    if (!rel) return "Unknown resident";
    const single = Array.isArray(rel) ? rel[0] : rel;
    return single?.full_name ?? "Unknown resident";
  };
  const incidentItems = incidentsRaw.map((i) => ({
    id: i.id,
    residentName: pickName(i.residents),
    severity: i.severity ?? "minor",
    category: i.category,
    description: i.description,
    occurredAt: i.occurred_at ?? i.created_at,
  }));

  // Demerits
  type RawDemerit = {
    id: string;
    status: string | null;
    reason: string | null;
    category: string | null;
    created_at: string | null;
    worked_off_at: string | null;
    residents?: { full_name?: string } | { full_name?: string }[] | null;
  };
  const demeritsRaw = ((demeritsRes.data ?? []) as unknown as RawDemerit[]).filter(
    (d) => isIn(d.created_at, range)
  );
  const demeritItems = demeritsRaw.map((d) => ({
    id: d.id,
    residentName: pickName(d.residents),
    reason: d.reason,
    category: d.category,
    createdAt: d.created_at,
  }));

  // Restrictions
  type RawRestriction = {
    id: string;
    is_active: boolean;
    description: string | null;
    start_date: string | null;
    end_date: string | null;
    created_at: string | null;
    residents?: { full_name?: string } | { full_name?: string }[] | null;
  };
  const restrictionsRaw = (
    (restrictionsRes.data ?? []) as unknown as RawRestriction[]
  ).filter((r) => isIn(r.created_at, range));
  const activeRestrictions = restrictionsRaw.filter((r) => r.is_active).length;
  const liftedRestrictions = restrictionsRaw.filter((r) => !r.is_active).length;
  const restrictionItems = restrictionsRaw.map((r) => ({
    id: r.id,
    residentName: pickName(r.residents),
    description: r.description,
    startDate: r.start_date,
    endDate: r.end_date,
    isActive: Boolean(r.is_active),
  }));

  // Supplies (current snapshot — not range-scoped)
  const supplies = suppliesRes.data ?? [];
  const inStock = supplies.filter((s) => s.is_in_stock).length;
  const outOfStock = supplies.length - inStock;
  const outOfStockNames = supplies.filter((s) => !s.is_in_stock).map((s) => s.name);

  // Check-ins — per-response ratings from form_data. Keys written by the
  // check-in form:
  //   meeting_rating       (Q1 meeting satisfaction, 1-10)
  //   work_rating          (Q7 work satisfaction, 1-10)
  //   jsl_feeling_rating   (Q8 feeling about being a resident, 1-10 — proxy for well-being)
  //   current_job          (Q6 current workplace / job)
  const responsesInRange = (checkInResponsesRes.data ?? []).filter((r) =>
    isIn(r.created_at, range)
  );
  const meetingResponses: { id: string; name: string; rating: number }[] = [];
  const workResponses: {
    id: string;
    name: string;
    job: string | null;
    rating: number;
  }[] = [];
  const wellbeingResponses: { id: string; name: string; rating: number }[] = [];
  for (const resp of responsesInRange) {
    if (resp.status !== "completed") continue;
    const fd = (resp.form_data ?? {}) as Record<string, unknown>;
    const residentRel = (resp as { residents?: { full_name?: string } | { full_name?: string }[] | null }).residents;
    const name = pickName(residentRel);
    const m = Number(fd.meeting_rating as number | string | undefined);
    if (Number.isFinite(m) && m > 0) {
      meetingResponses.push({ id: resp.id, name, rating: m });
    }
    const w = Number(fd.work_rating as number | string | undefined);
    if (Number.isFinite(w) && w > 0) {
      const rawJob = fd.current_job;
      const job =
        typeof rawJob === "string" && rawJob.trim().length > 0
          ? rawJob.trim()
          : null;
      workResponses.push({ id: resp.id, name, job, rating: w });
    }
    const wb = Number(fd.jsl_feeling_rating as number | string | undefined);
    if (Number.isFinite(wb) && wb > 0) {
      wellbeingResponses.push({ id: resp.id, name, rating: wb });
    }
  }

  return {
    census: {
      currentResidents: currentResidents.length,
      totalBeds,
      occupiedBeds,
      openBeds: Math.max(openBeds, 0),
      newResidents: newResidentsInRange.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        move_in_date: r.move_in_date,
      })),
      occupiedBedDetails,
      openBedDetails,
    },
    discharges,
    voluntaryDepartures,
    meetingResponses,
    workResponses,
    wellbeingResponses,
    incidents: {
      total: incidentsRaw.length,
      bySeverity: incidentsBySeverity,
      items: incidentItems,
    },
    demerits: {
      issued: demeritsRaw.length,
      items: demeritItems,
    },
    restrictions: {
      active: activeRestrictions,
      lifted: liftedRestrictions,
      items: restrictionItems,
    },
    supplies: {
      total: supplies.length,
      inStock,
      outOfStock,
      outOfStockNames,
      items: supplies.map((s) => ({
        id: s.id,
        name: s.name,
        isInStock: s.is_in_stock,
      })),
    },
  };
}
