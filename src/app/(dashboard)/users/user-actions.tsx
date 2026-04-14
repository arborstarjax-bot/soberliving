"use client";

import { useTransition, useState } from "react";
import { changeUserRole, deactivateUser, assignManagerToHouses } from "./actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MoreVertical } from "lucide-react";
import { useActionState } from "react";

interface Props {
  userId: string;
  currentRole: string;
  houses: { id: string; name: string }[];
  assignedHouseIds: string[];
}

export function UserActions({
  userId,
  currentRole,
  houses,
  assignedHouseIds,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [showHouseAssign, setShowHouseAssign] = useState(false);
  const [assignState, assignAction, assignPending] = useActionState(
    assignManagerToHouses,
    undefined
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
            <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {currentRole !== "admin" && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() =>
                startTransition(() => { changeUserRole(userId, "admin"); })
              }
            >
              Promote to Admin
            </DropdownMenuItem>
          )}
          {currentRole !== "manager" && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() =>
                startTransition(() => { changeUserRole(userId, "manager"); })
              }
            >
              Set as Manager
            </DropdownMenuItem>
          )}
          {currentRole !== "resident" && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() =>
                startTransition(() => { changeUserRole(userId, "resident"); })
              }
            >
              Set as Resident
            </DropdownMenuItem>
          )}
          {(currentRole === "manager" || currentRole === "admin") && (
            <DropdownMenuItem onClick={() => setShowHouseAssign(true)}>
              Assign Houses
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            disabled={isPending}
            onClick={() => {
              if (confirm("Deactivate this user? They will lose access.")) {
                startTransition(() => { deactivateUser(userId); });
              }
            }}
          >
            Deactivate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showHouseAssign} onOpenChange={setShowHouseAssign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Houses</DialogTitle>
          </DialogHeader>
          <form action={assignAction} className="space-y-4">
            <input type="hidden" name="user_id" value={userId} />
            <div className="space-y-2">
              {houses.map((house) => (
                <label key={house.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="house_ids"
                    value={house.id}
                    defaultChecked={assignedHouseIds.includes(house.id)}
                    className="h-4 w-4 rounded border-input"
                  />
                  {house.name}
                </label>
              ))}
            </div>
            {assignState?.error && (
              <p className="text-sm text-destructive">{assignState.error}</p>
            )}
            <Button type="submit" className="w-full" disabled={assignPending}>
              {assignPending ? "Saving…" : "Save Assignments"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
