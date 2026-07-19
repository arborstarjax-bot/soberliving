"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { archiveHouse } from "./actions";

interface DeleteHouseDialogProps {
  houseId: string;
  houseName: string;
}

export function DeleteHouseDialog({ houseId, houseName }: DeleteHouseDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await archiveHouse(houseId);
      if (result?.error) {
        setError(result.error);
      }
      // archiveHouse redirects to /houses on success
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" />}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete House</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete <strong>{houseName}</strong>? This will
          archive the house and all its rooms and beds. This action cannot be
          undone.
        </p>
        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
