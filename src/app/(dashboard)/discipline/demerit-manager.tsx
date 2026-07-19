"use client";

import { useActionState, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, CheckCircle } from "lucide-react";
import {
  createDemerit,
  editDemerit,
  deleteDemerit,
  markDemeritWorkedOff,
  generateMissedChoreDemerits,
} from "./actions";

interface Resident {
  id: string;
  full_name: string;
}

interface Demerit {
  id: string;
  resident_id: string;
  reason: string;
  notes: string | null;
  status: string;
  auto_generated: boolean;
  created_at: string;
  worked_off_at: string | null;
  worked_off_note: string | null;
}

export function DemeritManager({
  houseId,
  houseName,
  residents,
  demerits,
  userRole,
}: {
  houseId: string;
  houseName: string;
  residents: Resident[];
  demerits: Demerit[];
  userRole: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [state, action, pending] = useActionState(createDemerit, undefined);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editReason, setEditReason] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [workOffId, setWorkOffId] = useState<string | null>(null);
  const [workOffNote, setWorkOffNote] = useState("");
  const [autoResult, setAutoResult] = useState<string | null>(null);

  const activeDemerits = demerits.filter((d) => d.status === "active");
  const workedOffDemerits = demerits.filter((d) => d.status === "worked_off");

  const getResidentName = (id: string) =>
    residents.find((r) => r.id === id)?.full_name ?? "Unknown";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Manage Demerits — {houseName}</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await generateMissedChoreDemerits();
                    if ("count" in result) {
                      setAutoResult(`Generated ${result.count} auto-demerit(s) for missed chores`);
                    } else if (result.error) {
                      setAutoResult(`Error: ${result.error}`);
                    }
                    setTimeout(() => setAutoResult(null), 5000);
                  })
                }
              >
                Auto-Generate Missed Chores
              </Button>

              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger render={<Button size="sm" />}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Issue Demerit
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Issue Demerit</DialogTitle>
                  </DialogHeader>
                  <form action={action} className="space-y-4">
                    <input type="hidden" name="house_id" value={houseId} />
                    <input type="hidden" name="points" value="1" />
                    <div className="space-y-2">
                      <Label>Resident *</Label>
                      <select
                        name="resident_id"
                        required
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      >
                        <option value="">Select resident</option>
                        {residents.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Reason *</Label>
                      <Input name="reason" required placeholder="Reason for demerit" />
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea name="notes" rows={2} placeholder="Additional notes" />
                    </div>
                    {state?.error && (
                      <p className="text-sm text-destructive">{state.error}</p>
                    )}
                    <Button type="submit" className="w-full" disabled={pending}>
                      {pending ? "Issuing…" : "Issue Demerit"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          {autoResult && (
            <p className="text-sm text-muted-foreground mt-2">{autoResult}</p>
          )}
        </CardHeader>

        <CardContent>
          {activeDemerits.length === 0 && workedOffDemerits.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">
              No demerits recorded
            </p>
          ) : (
            <div className="space-y-4">
              {/* Active Demerits */}
              {activeDemerits.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                    Active
                    <Badge variant="destructive" className="text-[10px]">
                      {activeDemerits.length}
                    </Badge>
                  </h3>
                  <div className="space-y-2">
                    {activeDemerits.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-start justify-between border rounded-md p-3 bg-red-50/50 dark:bg-red-950/10"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">
                              {getResidentName(d.resident_id)}
                            </p>
                            {d.auto_generated && (
                              <Badge variant="outline" className="text-[10px]">
                                Auto
                              </Badge>
                            )}
                          </div>

                          {editingId === d.id ? (
                            <div className="mt-2 space-y-2">
                              <Input
                                value={editReason}
                                onChange={(e) => setEditReason(e.target.value)}
                                className="h-8 text-xs"
                                placeholder="Reason"
                              />
                              <Input
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                className="h-8 text-xs"
                                placeholder="Notes"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="h-7"
                                  disabled={isPending}
                                  onClick={() =>
                                    startTransition(async () => {
                                      await editDemerit(d.id, editReason, editNotes || undefined);
                                      setEditingId(null);
                                    })
                                  }
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7"
                                  onClick={() => setEditingId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm text-muted-foreground">
                                {d.reason}
                              </p>
                              {d.notes && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {d.notes}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(d.created_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })}
                              </p>
                            </>
                          )}

                          {workOffId === d.id && (
                            <div className="mt-2 flex items-center gap-2">
                              <Input
                                value={workOffNote}
                                onChange={(e) => setWorkOffNote(e.target.value)}
                                className="h-8 text-xs flex-1"
                                placeholder="What did they do to work it off?"
                              />
                              <Button
                                size="sm"
                                className="h-8"
                                disabled={isPending}
                                onClick={() =>
                                  startTransition(async () => {
                                    await markDemeritWorkedOff(d.id, workOffNote || undefined);
                                    setWorkOffId(null);
                                    setWorkOffNote("");
                                  })
                                }
                              >
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8"
                                onClick={() => {
                                  setWorkOffId(null);
                                  setWorkOffNote("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                        </div>

                        {editingId !== d.id && workOffId !== d.id && (
                          <div className="flex items-center gap-1 ml-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              title="Mark Worked Off"
                              disabled={isPending}
                              onClick={() => {
                                setWorkOffId(d.id);
                                setWorkOffNote("");
                              }}
                            >
                              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              title="Edit"
                              disabled={isPending}
                              onClick={() => {
                                setEditingId(d.id);
                                setEditReason(d.reason);
                                setEditNotes(d.notes ?? "");
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {userRole === "admin" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive"
                                title="Delete"
                                disabled={isPending}
                                onClick={() =>
                                  startTransition(async () => {
                                    await deleteDemerit(d.id);
                                  })
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Worked Off Demerits */}
              {workedOffDemerits.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                    Worked Off
                    <Badge variant="secondary" className="text-[10px]">
                      {workedOffDemerits.length}
                    </Badge>
                  </h3>
                  <div className="space-y-2">
                    {workedOffDemerits.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-start justify-between border rounded-md p-3 bg-green-50/50 dark:bg-green-950/10 opacity-70"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">
                            {getResidentName(d.resident_id)}
                          </p>
                          <p className="text-sm text-muted-foreground line-through">
                            {d.reason}
                          </p>
                          {d.worked_off_note && (
                            <p className="text-xs text-green-600 mt-0.5">
                              Worked off: {d.worked_off_note}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(d.created_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })}
                            {d.worked_off_at &&
                              ` → ${new Date(d.worked_off_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })}`}
                          </p>
                        </div>
                        {userRole === "admin" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive"
                            title="Delete"
                            disabled={isPending}
                            onClick={() =>
                              startTransition(async () => {
                                await deleteDemerit(d.id);
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
