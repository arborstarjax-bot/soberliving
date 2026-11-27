"use client";

import { useActionState, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Car, Plus } from "lucide-react";
import { createRideShare, type CreateRideState } from "./actions";

interface NewRideFormProps {
  houses: { id: string; name: string }[];
  singleHouse?: boolean;
}

const DESTINATIONS = [
  { value: "meeting", label: "Meeting" },
  { value: "church", label: "Church" },
  { value: "store", label: "Store" },
  { value: "other", label: "Other" },
] as const;

export function NewRideForm({ houses, singleHouse }: NewRideFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [destinationType, setDestinationType] = useState<
    "meeting" | "church" | "store" | "other"
  >("meeting");
  const [houseId, setHouseId] = useState(singleHouse ? houses[0]?.id ?? "" : "");

  const [state, action, isPending] = useActionState<
    CreateRideState | undefined,
    FormData
  >(async (prev, formData) => {
    formData.set("house_id", houseId);
    formData.set("destination_type", destinationType);
    const result = await createRideShare(prev, formData);
    if (result.ok) {
      setIsOpen(false);
      setDestinationType("meeting");
      if (!singleHouse) setHouseId("");
    }
    return result;
  }, undefined);

  const fromHouseName = houses.find((h) => h.id === houseId)?.name;

  if (!isOpen) {
    return (
      <Card>
        <CardContent className="p-4">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => setIsOpen(true)}
            disabled={houses.length === 0}
          >
            <Car className="h-4 w-4" />
            Offer a ride share
          </Button>
          {houses.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              You need to be a resident, manager, or admin of a house to
              offer a ride.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <form action={action} className="space-y-4">
          <div className="flex items-center gap-2 font-semibold">
            <Car className="h-4 w-4" />
            New ride share
          </div>

          {singleHouse && fromHouseName ? (
            <div className="text-sm text-muted-foreground">
              Leaving from: <span className="font-medium text-foreground">{fromHouseName}</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Leaving from</Label>
              <select
                required
                value={houseId}
                onChange={(e) => setHouseId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="" disabled>
                  Choose a house…
                </option>
                {houses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Destination type</Label>
              <select
                required
                value={destinationType}
                onChange={(e) =>
                  setDestinationType(
                    e.target.value as "meeting" | "church" | "store" | "other"
                  )
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {DESTINATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seats_total">Seats total (1–8)</Label>
              <Input
                id="seats_total"
                name="seats_total"
                type="number"
                min={1}
                max={8}
                defaultValue={4}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destination_label">
              {destinationType === "other"
                ? "Destination (required)"
                : "Destination (optional)"}
            </Label>
            <Input
              id="destination_label"
              name="destination_label"
              maxLength={200}
              placeholder={
                destinationType === "meeting"
                  ? "e.g. 7pm AA at St. Mary's"
                  : destinationType === "church"
                  ? "e.g. Sunday service"
                  : destinationType === "store"
                  ? "e.g. Walmart"
                  : "Where are you going?"
              }
              required={destinationType === "other"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="departure_date">Departure date</Label>
              <Input
                id="departure_date"
                name="departure_date"
                type="date"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="departure_time">Departure time</Label>
              <Input
                id="departure_time"
                name="departure_time"
                type="time"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              maxLength={2000}
              placeholder="Meeting spot, anything riders should know…"
              rows={2}
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {isPending ? "Posting…" : "Post ride"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
