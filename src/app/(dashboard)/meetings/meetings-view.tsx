"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  MapPin,
  Clock,
  User,
  FileImage,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { getDocumentUrl } from "@/app/(intake)/actions";
import { deleteMeeting } from "./actions";
import { Trash2 } from "lucide-react";

interface MeetingRow {
  id: string;
  resident_id: string;
  meeting_name: string;
  location: string;
  meeting_at: string;
  facilitator_name: string | null;
  facilitator_signature: string;
  photo_path: string | null;
  resident?: { full_name?: string } | { full_name?: string }[] | null;
  house?: { name?: string } | { name?: string }[] | null;
}

interface ResidentLite {
  id: string;
  full_name: string;
  house_id: string;
}

interface Props {
  meetings: MeetingRow[];
  residents?: ResidentLite[];
  showResident: boolean;
  isAdmin?: boolean;
}

function mondayOf(d: Date): Date {
  const m = new Date(d);
  const day = m.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  m.setDate(m.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function weekKey(iso: string): string {
  return mondayOf(new Date(iso)).toISOString().slice(0, 10);
}

function weekLabel(key: string): string {
  const start = new Date(`${key}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Week of ${fmt(start)} – ${fmt(end)}`;
}

function residentName(m: MeetingRow): string {
  const r = Array.isArray(m.resident) ? m.resident[0] : m.resident;
  return (r as { full_name?: string } | null)?.full_name ?? "";
}

function houseName(m: MeetingRow): string {
  const h = Array.isArray(m.house) ? m.house[0] : m.house;
  return (h as { name?: string } | null)?.name ?? "";
}

async function openPhoto(path: string) {
  const res = await getDocumentUrl(path);
  if (res.ok && res.url) window.open(res.url, "_blank");
}

function MeetingCard({
  m,
  showResident,
  isAdmin,
}: {
  m: MeetingRow;
  showResident: boolean;
  isAdmin: boolean;
}) {
  const when = new Date(m.meeting_at);
  return (
    <Card>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{m.meeting_name}</p>
              {showResident && (
                <span className="text-xs text-muted-foreground">
                  {residentName(m)}
                  {houseName(m) && ` · ${houseName(m)}`}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {m.location}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {when.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}{" "}
                at{" "}
                {when.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              {m.facilitator_name && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {m.facilitator_name}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {m.photo_path && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => openPhoto(m.photo_path as string)}
              >
                <FileImage className="h-3.5 w-3.5" />
                Photo
              </Button>
            )}
            {isAdmin && (
              <form
                action={async (formData) => {
                  await deleteMeeting(undefined, formData);
                }}
              >
                <input type="hidden" name="meeting_id" value={m.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 px-0 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </form>
            )}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={m.facilitator_signature}
          alt="Facilitator signature"
          className="h-14 rounded border bg-white px-3"
        />
      </CardContent>
    </Card>
  );
}

export function MeetingsView({ meetings, residents, showResident, isAdmin = false }: Props) {
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  const thisWeekKey = weekKey(new Date().toISOString());
  const thisWeek = meetings.filter((m) => weekKey(m.meeting_at) === thisWeekKey);

  const byWeek = useMemo(() => {
    const map = new Map<string, MeetingRow[]>();
    for (const m of meetings) {
      const k = weekKey(m.meeting_at);
      map.set(k, [...(map.get(k) ?? []), m]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [meetings]);

  // Staff: who has logged nothing this week.
  const missingThisWeek = useMemo(() => {
    if (!residents) return [];
    const logged = new Set(thisWeek.map((m) => m.resident_id));
    return residents.filter((r) => !logged.has(r.id));
  }, [residents, thisWeek]);

  function toggleWeek(k: string) {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">This Week</h2>
          <Badge variant="secondary">{thisWeek.length}</Badge>
        </div>
        {thisWeek.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No meetings logged yet this week.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {thisWeek.map((m) => (
              <MeetingCard key={m.id} m={m} showResident={showResident} isAdmin={isAdmin} />
            ))}
          </div>
        )}
        {missingThisWeek.length > 0 && (
          <Card className="border-amber-500/40 bg-amber-50/50">
            <CardContent className="py-3">
              <p className="text-sm font-medium">
                No meeting logged this week ({missingThisWeek.length})
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {missingThisWeek.map((r) => r.full_name).join(", ")}
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">History</h2>
        {byWeek.filter(([k]) => k !== thisWeekKey).length === 0 ? (
          <EmptyState title="No past meetings" />
        ) : (
          byWeek
            .filter(([k]) => k !== thisWeekKey)
            .map(([k, rows]) => {
              const open = expandedWeeks.has(k);
              return (
                <div key={k} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleWeek(k)}
                    className="flex w-full items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    {weekLabel(k)}
                    <Badge variant="outline" className="ml-1">
                      {rows.length}
                    </Badge>
                  </button>
                  {open && (
                    <div className="space-y-2 pl-6">
                      {rows.map((m) => (
                        <MeetingCard key={m.id} m={m} showResident={showResident} isAdmin={isAdmin} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
        )}
      </section>
    </div>
  );
}
