"use client";

import { useState, useTransition } from "react";
import {
  Car,
  Clock,
  MapPin,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import type { UserRole } from "@/lib/types";
import {
  deleteRideShare,
  reserveRideSeat,
  unreserveRideSeat,
} from "./actions";

interface Ride {
  id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  house_id: string;
  house_name: string | null;
  created_at: string;
  destination_type: "meeting" | "church" | "store" | "other";
  destination_label: string | null;
  seats_total: number;
  seats_reserved: number;
  seats_left: number;
  is_full: boolean;
  departure_at: string;
  is_past: boolean;
  notes: string;
  reservations: { user_id: string; name: string }[];
  user_has_reservation: boolean;
}

interface RideListProps {
  rides: Ride[];
  currentUserId: string;
  currentUserRole: UserRole;
}

const DEST_LABEL: Record<Ride["destination_type"], string> = {
  meeting: "Meeting",
  church: "Church",
  store: "Store",
  other: "Trip",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });

  if (sameDay) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;

  const datePart = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year:
      d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    timeZone: "America/New_York",
  });
  return `${datePart} · ${time}`;
}

export function RideList({
  rides,
  currentUserId,
  currentUserRole,
}: RideListProps) {
  if (rides.length === 0) {
    return (
      <div className="rounded-xl border bg-white shadow-sm p-12 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Car className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No ride shares yet</h3>
        <p className="text-muted-foreground text-sm">
          Be the first to offer a ride to your housemates.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rides.map((ride) => (
        <RideCard
          key={ride.id}
          ride={ride}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
        />
      ))}
    </div>
  );
}

function RideCard({
  ride,
  currentUserId,
  currentUserRole,
}: {
  ride: Ride;
  currentUserId: string;
  currentUserRole: UserRole;
}) {
  const isStaff =
    currentUserRole === "admin" || currentUserRole === "manager";
  const isAuthor = ride.author_id === currentUserId;
  const canDelete = isAuthor || isStaff;
  const isPast = ride.is_past;

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleToggleReserve = () => {
    setError(null);
    startTransition(async () => {
      if (ride.user_has_reservation) {
        const res = await unreserveRideSeat(ride.id);
        if (res.error) setError(res.error);
      } else {
        const res = await reserveRideSeat(ride.id);
        if (res.error) setError(res.error);
        else if (res.status === "full") setError("This ride is full.");
      }
    });
  };

  const handleDelete = () => {
    if (!confirm("Remove this ride share?")) return;
    startTransition(async () => {
      const res = await deleteRideShare(ride.id);
      if (res.error) setError(res.error);
    });
  };

  const destinationDisplay =
    ride.destination_label ??
    (ride.destination_type === "other"
      ? "Trip"
      : DEST_LABEL[ride.destination_type]);

  return (
    <article
      className={`rounded-xl border bg-white shadow-sm overflow-hidden ${
        isPast ? "opacity-75" : ""
      }`}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Car className="h-5 w-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">
                {ride.author_name}
              </span>
              {ride.house_name && (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold leading-none text-amber-700">
                  {ride.house_name}
                </span>
              )}
              {ride.is_full && !isPast && (
                <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold leading-none text-red-700">
                  FULL
                </span>
              )}
              {isPast && (
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold leading-none text-gray-600">
                  Past
                </span>
              )}
            </div>

            <h3 className="mt-1 text-base font-semibold text-foreground">
              {destinationDisplay}
            </h3>

            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 shrink-0" />
                <span>{formatWhen(ride.departure_at)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" />
                <span>{DEST_LABEL[ride.destination_type]}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 shrink-0" />
                <span>
                  {ride.seats_left} of {ride.seats_total} seat
                  {ride.seats_total !== 1 ? "s" : ""} left
                </span>
              </div>
            </div>

            {ride.notes && (
              <p className="mt-3 text-sm text-foreground/90 whitespace-pre-wrap">
                {ride.notes}
              </p>
            )}

            {ride.reservations.length > 0 && (
              <div className="mt-3 text-xs text-muted-foreground">
                Riding:{" "}
                {ride.reservations
                  .map((r) => r.name)
                  .join(", ")}
              </div>
            )}

            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          <div className="flex items-start gap-1">
            <button
              type="button"
              title={
                ride.user_has_reservation
                  ? "Release your seat"
                  : ride.is_full
                  ? "Ride is full"
                  : "Reserve a seat"
              }
              onClick={handleToggleReserve}
              disabled={
                isPending ||
                isPast ||
                (ride.is_full && !ride.user_has_reservation)
              }
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                ride.user_has_reservation
                  ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                  : ride.is_full
                  ? "border-gray-200 text-gray-300 cursor-not-allowed"
                  : "border-gray-200 text-gray-500 hover:border-indigo-600 hover:text-indigo-600"
              } disabled:opacity-60`}
            >
              <Car className="h-4 w-4" />
            </button>

            {canDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <MoreVertical className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={isPending}
                    onClick={handleDelete}
                    className="text-red-600"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove ride
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
