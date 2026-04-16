import { createClient } from "@/lib/supabase/server";

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
  checkIns: {
    sent: number;
    submitted: number;
  };
  meetingSatisfaction: number[];
  workSatisfaction: number[];
  wellbeing: number[];
  incidents: {
    total: number;
    bySeverity: { minor: number; major: number; critical: number };
  };
  demerits: {
    issued: number;
    workedOff: number;
  };
  restrictions: {
    active: number;
    lifted: number;
  };
  supplies: {
    total: number;
    inStock: number;
    outOfStock: number;
    outOfStockNames: string[];
  };
}

export interface DateRange {
  startIso: string | null; // null = no lower bound (all-time "To Date")
  endIso: string; // inclusive end, ISO date
  label: string;
}

export function resolveRange(
  range: string,
  customStart: string,
  customEnd: string
): DateRange {
  const now = new Date();
  const endIso = new Date().toISOString();

  switch (range) {
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        startIso: start.toISOString(),
        endIso,
        label: `${start.toLocaleString("default", {
          month: "long",
          year: "numeric",
        })} to date`,
      };
    }
    case "90d": {
      const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return {
        startIso: start.toISOString(),
        endIso,
        label: "Last 90 days",
      };
    }
    case "6mo": {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      return {
        startIso: start.toISOString(),
        endIso,
        label: "Last 6 months",
      };
    }
    case "1y": {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      return {
        startIso: start.toISOString(),
        endIso,
        label: "Last 12 months",
      };
    }
    case "custom": {
      const start = customStart ? new Date(customStart) : null;
      const end = customEnd ? new Date(customEnd) : new Date();
      // Push end to end of day so queries are inclusive
      end.setHours(23, 59, 59, 999);
      return {
        startIso: start ? start.toISOString() : null,
        endIso: end.toISOString(),
        label: `${
          start ? start.toLocaleDateString() : "All time"
        } – ${end.toLocaleDateString()}`,
      };
    }
    case "to_date":
    default:
      return { startIso: null, endIso, label: "All time to date" };
  }
}

function isIn(dateStr: string | null | undefined, range: DateRange): boolean {
  if (!dateStr) return false;
  // Normalize date-only strings ("YYYY-MM-DD") to a full ISO timestamp so
  // lexicographic comparison against range.startIso / range.endIso is correct.
  // Without this, "2026-03-01" < "2026-03-01T00:00:00.000Z" is true, which
  // incorrectly excludes records that fall exactly on the range start date.
  const normalized = dateStr.length === 10 ? `${dateStr}T00:00:00.000Z` : dateStr;
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
      .select("id, beds(id, is_active, label, bed_assignments(end_date))")
      .eq("house_id", houseId)
      .eq("is_active", true),
    supabase
      .from("incidents")
      .select("id, severity, occurred_at, created_at")
      .eq("house_id", houseId),
    supabase
      .from("demerits")
      .select("id, status, created_at, worked_off_at, residents!inner(house_id)")
      .eq("residents.house_id", houseId),
    supabase
      .from("restrictions")
      .select(
        "id, is_active, start_date, end_date, created_at, residents!inner(house_id)"
      )
      .eq("residents.house_id", houseId),
    supabase
      .from("supply_items")
      .select("id, name, is_in_stock")
      .eq("house_id", houseId),
    supabase
      .from("check_in_responses")
      .select("id, status, created_at, completed_at, form_data")
      .eq("house_id", houseId),
  ]);

  // Census
  const residents = residentsRes.data ?? [];
  const currentResidents = residents.filter((r) => r.status === "active");
  const newResidentsInRange = currentResidents.filter((r) =>
    isIn(r.move_in_date, range)
  );

  // Beds
  const rooms = roomsRes.data ?? [];
  let totalBeds = 0;
  let occupiedBeds = 0;
  let emptyMarkedBeds = 0;
  for (const room of rooms) {
    const beds = (
      room as unknown as {
        beds: { id: string; is_active: boolean; label: string; bed_assignments: { end_date: string | null }[] }[];
      }
    ).beds ?? [];
    for (const bed of beds) {
      if (!bed.is_active) continue;
      totalBeds++;
      const occupied = (bed.bed_assignments ?? []).some(
        (ba) => !ba.end_date
      );
      if (occupied) occupiedBeds++;
      else if (bed.label.endsWith(" [Empty]")) emptyMarkedBeds++;
    }
  }
  const openBeds = totalBeds - occupiedBeds - emptyMarkedBeds;

  // Discharges / departures (within range). Split by the explicit
  // `discharge_is_voluntary` flag set on the Discharge dialog.
  const dischargedInRange = residents.filter(
    (r) => r.status === "discharged" && isIn(r.move_out_date, range)
  );
  const discharges = dischargedInRange
    .filter(
      (r) =>
        !(r as unknown as { discharge_is_voluntary: boolean | null })
          .discharge_is_voluntary
    )
    .map((r) => ({
      id: r.id,
      full_name: r.full_name,
      move_out_date: r.move_out_date,
      reason: r.discharge_reason ?? null,
    }));
  const voluntaryDepartures = dischargedInRange
    .filter(
      (r) =>
        (r as unknown as { discharge_is_voluntary: boolean | null })
          .discharge_is_voluntary === true
    )
    .map((r) => ({
      id: r.id,
      full_name: r.full_name,
      move_out_date: r.move_out_date,
    }));

  // Incidents
  const incidents = (incidentsRes.data ?? []).filter((i) =>
    isIn(i.occurred_at ?? i.created_at, range)
  );
  const incidentsBySeverity = {
    minor: incidents.filter((i) => i.severity === "minor").length,
    major: incidents.filter((i) => i.severity === "major").length,
    critical: incidents.filter((i) => i.severity === "critical").length,
  };

  // Demerits
  const demerits = (demeritsRes.data ?? []).filter((d) =>
    isIn(d.created_at, range)
  );
  const workedOff = demerits.filter((d) => d.status === "worked_off").length;

  // Restrictions
  const restrictions = (restrictionsRes.data ?? []).filter((r) =>
    isIn(r.created_at, range)
  );
  const activeRestrictions = restrictions.filter((r) => r.is_active).length;
  const liftedRestrictions = restrictions.filter((r) => !r.is_active).length;

  // Supplies (current snapshot — not range-scoped)
  const supplies = suppliesRes.data ?? [];
  const inStock = supplies.filter((s) => s.is_in_stock).length;
  const outOfStock = supplies.length - inStock;
  const outOfStockNames = supplies.filter((s) => !s.is_in_stock).map((s) => s.name);

  // Check-ins
  // "Sent" = any response row created in range for this house
  // "Submitted" = responses that reached status=completed (using completed_at
  // when available, otherwise the created_at filter still catches them).
  const responsesInRange = (checkInResponsesRes.data ?? []).filter((r) =>
    isIn(r.created_at, range)
  );
  const sent = responsesInRange.length;
  const submitted = responsesInRange.filter(
    (r) => r.status === "completed"
  ).length;

  // Ratings from form_data. The check-in form writes these exact keys:
  //   meeting_rating       (Q1 meeting satisfaction, 1-10)
  //   work_rating          (Q7 work satisfaction, 1-10)
  //   jsl_feeling_rating   (Q8 feeling about being a resident, 1-10 — proxy for well-being)
  const meetingSatisfaction: number[] = [];
  const workSatisfaction: number[] = [];
  const wellbeing: number[] = [];
  for (const resp of responsesInRange) {
    if (resp.status !== "completed") continue;
    const fd = (resp.form_data ?? {}) as Record<string, unknown>;
    const m = Number(fd.meeting_rating as number | string | undefined);
    if (Number.isFinite(m) && m > 0) meetingSatisfaction.push(m);
    const w = Number(fd.work_rating as number | string | undefined);
    if (Number.isFinite(w) && w > 0) workSatisfaction.push(w);
    const wb = Number(fd.jsl_feeling_rating as number | string | undefined);
    if (Number.isFinite(wb) && wb > 0) wellbeing.push(wb);
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
    },
    discharges,
    voluntaryDepartures,
    checkIns: { sent, submitted },
    meetingSatisfaction,
    workSatisfaction,
    wellbeing,
    incidents: {
      total: incidents.length,
      bySeverity: incidentsBySeverity,
    },
    demerits: {
      issued: demerits.length,
      workedOff,
    },
    restrictions: {
      active: activeRestrictions,
      lifted: liftedRestrictions,
    },
    supplies: {
      total: supplies.length,
      inStock,
      outOfStock,
      outOfStockNames,
    },
  };
}
