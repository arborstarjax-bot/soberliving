"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { UserRole } from "@/lib/types";
import { AddBedDialog } from "./add-bed-dialog";
import { AssignBedDialog } from "./assign-bed-dialog";
import { EditRoomDialog } from "./edit-room-dialog";

interface BedAssignment {
  id: string;
  end_date: string | null;
  resident: { id: string; full_name: string; status: string } | null;
}

interface BedData {
  id: string;
  label: string;
  is_active: boolean;
  bed_assignments: BedAssignment[];
}

interface RoomData {
  id: string;
  name: string;
  floor: number | null;
  beds: BedData[];
}

interface ResidentOption {
  id: string;
  full_name: string;
}

interface OccupancyGridProps {
  rooms: RoomData[];
  houseId: string;
  residents: ResidentOption[];
  userRole: UserRole;
}

export function OccupancyGrid({
  rooms,
  houseId,
  residents,
  userRole,
}: OccupancyGridProps) {
  const canManage = userRole === "admin" || userRole === "manager";

  if (rooms.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No rooms yet. Add a room to start managing occupancy.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {rooms.map((room) => (
        <Card key={room.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {room.name}
                {room.floor != null && (
                  <span className="text-muted-foreground font-normal ml-2">
                    Floor {room.floor}
                  </span>
                )}
              </CardTitle>
              <div className="flex items-center gap-1">
                {canManage && (
                  <EditRoomDialog
                    roomId={room.id}
                    roomName={room.name}
                    floor={room.floor}
                    bedCount={room.beds.length}
                    hasOccupiedBeds={room.beds.some((bed) =>
                      bed.bed_assignments.some((ba) => !ba.end_date)
                    )}
                  />
                )}
                {canManage && <AddBedDialog roomId={room.id} houseId={houseId} />}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {room.beds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No beds in this room
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {room.beds
                  .filter((bed) => bed.is_active)
                  .map((bed) => {
                    const activeAssignment = bed.bed_assignments.find(
                      (ba) => !ba.end_date
                    );
                    const isOccupied = !!activeAssignment;

                    return (
                      <div
                        key={bed.id}
                        className={`rounded-lg border p-3 ${
                          isOccupied
                            ? "border-primary/30 bg-primary/5"
                            : "border-dashed border-muted-foreground/30"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">
                            {bed.label}
                          </span>
                          <Badge
                            variant={isOccupied ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {isOccupied ? "Occupied" : "Available"}
                          </Badge>
                        </div>
                        {isOccupied && activeAssignment?.resident ? (
                          <p className="text-sm text-muted-foreground">
                            {activeAssignment.resident.full_name}
                          </p>
                        ) : canManage ? (
                          <AssignBedDialog
                            bedId={bed.id}
                            bedLabel={bed.label}
                            roomName={room.name}
                            houseId={houseId}
                            residents={residents}
                          />
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
