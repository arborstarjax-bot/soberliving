"use client";

import { useActionState, useState } from "react";
import { deleteWorkspace } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteWorkspaceCard({ workspaceName }: { workspaceName: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteWorkspace, undefined);

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Delete Workspace</CardTitle>
        <CardDescription>
          Permanently deletes this workspace and everything in it — houses,
          residents, records, files, and every member account. This cannot be
          undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button variant="destructive" />}>
            Delete workspace
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {workspaceName}?</DialogTitle>
              <DialogDescription>
                All houses, residents, payments, documents, and member accounts
                will be permanently deleted. Type{" "}
                <strong>{workspaceName}</strong> to confirm.
              </DialogDescription>
            </DialogHeader>
            <form action={formAction} className="space-y-3">
              <Input
                name="confirm"
                placeholder={workspaceName}
                autoComplete="off"
                required
              />
              {state && !state.ok && (
                <p className="text-sm text-destructive">{state.error}</p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={pending}>
                  {pending ? "Deleting…" : "Delete permanently"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
