"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface Bed {
  id: string;
  label: string;
  room_id: string;
  bed_assignments: {
    end_date: string | null;
    resident: { full_name: string; status: string } | null;
  }[];
}
interface Room {
  id: string;
  name: string;
  house_id: string;
}
interface House {
  id: string;
  name: string;
}
interface Resident {
  id: string;
  full_name: string;
  status: string;
  house_id: string;
  sobriety_date: string | null;
  created_at: string;
}

export function ManifestView({
  houses,
  rooms,
  beds,
  residents,
}: {
  houses: House[];
  rooms: Room[];
  beds: Bed[];
  residents: Resident[];
}) {
  const downloadCsv = (houseId?: string) => {
    const scope = houseId
      ? residents.filter((r) => r.house_id === houseId)
      : residents;
    const houseName = (id: string) =>
      houses.find((h) => h.id === id)?.name ?? "";
    const rows = [
      ["House", "Resident", "Status", "Sobriety Date", "Onboarded"].join(","),
      ...scope.map((r) =>
        [
          csv(houseName(r.house_id)),
          csv(r.full_name),
          csv(r.status),
          csv(r.sobriety_date ?? ""),
          csv(new Date(r.created_at).toLocaleDateString()),
        ].join(",")
      ),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = houseId
      ? `residents-${houseName(houseId).replace(/\s+/g, "-").toLowerCase()}.csv`
      : "residents-all-houses.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const csv = (v: string) => `"${v.replace(/"/g, '""')}"`;

  return (
    <>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => downloadCsv()}>
          <Download className="h-4 w-4 mr-1" /> Export All Residents CSV
        </Button>
      </div>

      {houses.map((h) => {
        const houseRooms = rooms.filter((r) => r.house_id === h.id);
        const houseBeds = beds.filter((b) =>
          houseRooms.some((r) => r.id === b.room_id)
        );
        const occupied = houseBeds.filter((b) =>
          b.bed_assignments.some((ba) => !ba.end_date)
        ).length;
        return (
          <Card key={h.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {h.name}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {occupied}/{houseBeds.length} beds taken
                </span>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => downloadCsv(h.id)}
              >
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {houseRooms.map((r) => {
                const roomBeds = beds.filter((b) => b.room_id === r.id);
                return (
                  <div key={r.id}>
                    <p className="text-sm font-medium mb-1">{r.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {roomBeds.map((b) => {
                        const occ = b.bed_assignments.find(
                          (ba) => !ba.end_date
                        );
                        return (
                          <Badge
                            key={b.id}
                            variant={occ ? "default" : "secondary"}
                          >
                            {b.label}
                            {occ?.resident?.full_name
                              ? ` — ${occ.resident.full_name}`
                              : " — Open"}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
