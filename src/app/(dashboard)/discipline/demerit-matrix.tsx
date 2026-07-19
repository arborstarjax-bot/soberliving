"use client";

import { useState, useTransition } from "react";
import { compressImage } from "@/lib/compress-image";
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
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, CheckCircle, X } from "lucide-react";
import {
  createDemerit,
  editDemerit,
  deleteDemerit,
  markDemeritWorkedOff,
  generateMissedChoreDemerits,
  createRestriction,
  uploadDemeritPhoto,
} from "./actions";
import { getHouseToday } from "@/lib/timezone";

const MAX_BOXES = 10;

const RESTRICTION_TYPES = [
  { value: "no_leave", label: "No Leave" },
  { value: "weekend_restriction", label: "Weekend Restriction" },
  { value: "house_commitment", label: "House Commitment (New Intake)" },
  { value: "curfew", label: "Curfew" },
  { value: "custom", label: "Custom" },
];

interface Resident {
  id: string;
  full_name: string;
  house_id: string;
}

interface Demerit {
  id: string;
  resident_id: string;
  house_id: string;
  reason: string;
  notes: string | null;
  category: string | null;
  status: string;
  auto_generated: boolean;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  photo_url: string | null;
}

interface Props {
  houses: { id: string; name: string }[];
  residents: Resident[];
  demerits: Demerit[];
  userRole: string;
}

export function DemeritMatrix({ houses, residents, demerits, userRole }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [selectedDemeritIndex, setSelectedDemeritIndex] = useState<number | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingDemerit, setEditingDemerit] = useState<Demerit | null>(null);
  const [autoResult, setAutoResult] = useState<string | null>(null);

  // Edit state
  const [editReason, setEditReason] = useState("");
  const [editNotes, setEditNotes] = useState("");
  // Work off state
  const [workOffDemerit, setWorkOffDemerit] = useState<Demerit | null>(null);
  const [workOffNote, setWorkOffNote] = useState("");

  const isStaff = userRole === "admin" || userRole === "manager";

  function getResidentDemerits(residentId: string) {
    return demerits
      .filter((d) => d.resident_id === residentId && d.status === "active")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  function handleBoxClick(resident: Resident, boxIndex: number) {
    const resDemerits = getResidentDemerits(resident.id);
    if (boxIndex < resDemerits.length) {
      // Clicking a filled box — open demerit detail
      setEditingDemerit(resDemerits[boxIndex]);
      setEditReason(resDemerits[boxIndex].reason);
      setEditNotes(resDemerits[boxIndex].notes ?? "");
      setSelectedDemeritIndex(boxIndex);
    } else if (isStaff) {
      // Clicking an empty box — open add form
      setSelectedResident(resident);
      setShowAddDialog(true);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Demerit Tracker</h2>
          <p className="text-sm text-muted-foreground">
            Click a filled box to view/edit, click an empty box to add a demerit
          </p>
        </div>
        {isStaff && (
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
        )}
      </div>
      {autoResult && (
        <p className="text-sm text-muted-foreground">{autoResult}</p>
      )}

      {/* Matrix per house */}
      {houses.map((house) => {
        const houseResidents = residents.filter((r) => r.house_id === house.id);
        if (houseResidents.length === 0) return null;

        return (
          <Card key={house.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{house.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {/* Header row */}
                <div className="grid gap-2" style={{ gridTemplateColumns: "180px repeat(10, 1fr)" }}>
                  <div className="text-xs font-medium text-muted-foreground">Resident</div>
                  {Array.from({ length: MAX_BOXES }, (_, i) => (
                    <div key={i} className="text-[10px] text-center text-muted-foreground">
                      {i + 1}
                    </div>
                  ))}
                </div>

                {/* Resident rows */}
                {houseResidents.map((resident) => {
                  const resDemerits = getResidentDemerits(resident.id);
                  const filledCount = resDemerits.length;

                  return (
                    <div
                      key={resident.id}
                      className="grid gap-2 items-center"
                      style={{ gridTemplateColumns: "180px repeat(10, 1fr)" }}
                    >
                      <div className="text-sm font-medium truncate" title={resident.full_name}>
                        {resident.full_name}
                        {filledCount > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({filledCount})
                          </span>
                        )}
                      </div>
                      {Array.from({ length: MAX_BOXES }, (_, i) => {
                        const isFilled = i < filledCount;
                        const isOver = filledCount > MAX_BOXES && i === MAX_BOXES - 1;
                        return (
                          <button
                            key={i}
                            type="button"
                            className={`
                              aspect-square rounded border-2 transition-all text-xs font-bold flex items-center justify-center
                              ${isFilled
                                ? filledCount >= 8
                                  ? "bg-red-500 border-red-600 text-white hover:bg-red-600"
                                  : filledCount >= 5
                                    ? "bg-orange-400 border-orange-500 text-white hover:bg-orange-500"
                                    : "bg-yellow-400 border-yellow-500 text-yellow-900 hover:bg-yellow-500"
                                : "bg-muted/30 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5"
                              }
                              ${isStaff || isFilled ? "cursor-pointer" : "cursor-default"}
                            `}
                            title={
                              isFilled
                                ? `Demerit ${i + 1}: ${resDemerits[i]?.reason ?? ""}`
                                : isStaff ? "Click to add demerit" : ""
                            }
                            onClick={() => handleBoxClick(resident, i)}
                          >
                            {isOver ? `${filledCount}` : isFilled ? "X" : ""}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* View/Edit Demerit Dialog — matches Issue Demerit style */}
      <Dialog open={!!editingDemerit} onOpenChange={(open) => { if (!open) { setEditingDemerit(null); setWorkOffDemerit(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isStaff ? "Edit Demerit" : "Demerit Details"}
              {editingDemerit?.auto_generated && (
                <Badge variant="outline" className="ml-2 text-[10px]">Auto-Generated</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {editingDemerit && (
            <div className="space-y-4">
              {/* Resident info — same style as Issue Demerit */}
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span className="font-medium">
                  {residents.find((r) => r.id === editingDemerit.resident_id)?.full_name ?? "Unknown"}
                </span>
                <span className="text-muted-foreground ml-2">
                  — {houses.find((h) => h.id === editingDemerit.house_id)?.name ?? ""}
                </span>
                {editingDemerit.category && (
                  <Badge variant="secondary" className="ml-2 text-xs">{editingDemerit.category}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Issued: {new Date(editingDemerit.created_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })}
              </p>

              {isStaff ? (
                <div className="space-y-4">
                  {/* Reason — full textarea like Issue Demerit */}
                  <div className="space-y-2">
                    <Label>Reason *</Label>
                    <Textarea
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      rows={2}
                      placeholder="Describe the infraction..."
                    />
                  </div>

                  {/* Notes — full textarea like Issue Demerit */}
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={2}
                      placeholder="Additional notes (optional)..."
                    />
                  </div>

                  {/* Photo */}
                  {editingDemerit.photo_url && (
                    <div className="space-y-2">
                      <Label>Photo</Label>
                      <a href={editingDemerit.photo_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline block">
                        View attached photo
                      </a>
                    </div>
                  )}

                  {/* Work off section */}
                  {workOffDemerit?.id === editingDemerit.id ? (
                    <div className="border-t pt-4 space-y-4">
                      <div className="space-y-2">
                        <Label>Resolution Note</Label>
                        <Textarea
                          value={workOffNote}
                          onChange={(e) => setWorkOffNote(e.target.value)}
                          rows={2}
                          placeholder="What did they do to work it off?"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              await markDemeritWorkedOff(editingDemerit.id, workOffNote || undefined);
                              setEditingDemerit(null);
                              setWorkOffDemerit(null);
                              setWorkOffNote("");
                            })
                          }
                        >
                          Confirm Worked Off
                        </Button>
                        <Button variant="outline" onClick={() => { setWorkOffDemerit(null); setWorkOffNote(""); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 border-t pt-4">
                      <Button
                        className="flex-1"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            await editDemerit(editingDemerit.id, editReason, editNotes || undefined);
                            setEditingDemerit(null);
                          })
                        }
                      >
                        Save Changes
                      </Button>
                      <Button
                        variant="outline"
                        disabled={isPending}
                        onClick={() => {
                          setWorkOffDemerit(editingDemerit);
                          setWorkOffNote("");
                        }}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" /> Mark Worked Off
                      </Button>
                      {userRole === "admin" && (
                        <Button
                          variant="destructive"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              if (confirm("Delete this demerit?")) {
                                await deleteDemerit(editingDemerit.id);
                                setEditingDemerit(null);
                              }
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4 mr-1" /> Delete
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <p className="text-sm rounded-md border px-3 py-2 bg-muted/30">{editingDemerit.reason}</p>
                  </div>
                  {editingDemerit.notes && (
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <p className="text-sm rounded-md border px-3 py-2 bg-muted/30">{editingDemerit.notes}</p>
                    </div>
                  )}
                  {editingDemerit.photo_url && (
                    <div className="space-y-2">
                      <Label>Photo</Label>
                      <a href={editingDemerit.photo_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline block">
                        View attached photo
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Demerit + Restriction Dialog */}
      <AddDemeritDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        houses={houses}
        residents={residents}
        preselectedResident={selectedResident}
      />
    </div>
  );
}

// Combined Add Demerit + Restriction form
function AddDemeritDialog({
  open,
  onOpenChange,
  houses,
  residents,
  preselectedResident,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  houses: { id: string; name: string }[];
  residents: Resident[];
  preselectedResident: Resident | null;
}) {
  const [selectedResident, setSelectedResident] = useState("");
  const [addRestriction, setAddRestriction] = useState(false);
  const [restrictionType, setRestrictionType] = useState("custom");
  const [demeritCount, setDemeritCount] = useState(1);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset ALL form state when dialog opens (prevent stale data)
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setPrevOpen(true);
    setSelectedResident(preselectedResident?.id ?? "");
    setAddRestriction(false);
    setRestrictionType("custom");
    setDemeritCount(1);
    setPhotoFile(null);
    setPhotoUrl(null);
    setUploadError(null);
  }
  if (!open && prevOpen) {
    setPrevOpen(false);
  }

  // Derive house from selected resident automatically
  const resolvedResident = preselectedResident ?? residents.find((r) => r.id === selectedResident) ?? null;
  const resolvedHouseId = resolvedResident?.house_id ?? "";
  const resolvedHouseName = houses.find((h) => h.id === resolvedHouseId)?.name ?? "";

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (!raw) return;
    setUploading(true);
    setUploadError(null);
    try {
      const file = await compressImage(raw);
      setPhotoFile(file);
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadDemeritPhoto(fd);
      if (result.error) {
        setUploadError(result.error);
        setPhotoUrl(null);
      } else {
        setPhotoUrl(result.url ?? null);
      }
    } finally {
      setUploading(false);
    }
  }

  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setSubmitError(null);
      // Submit demerit(s) — call server action directly to properly await each
      const count = Math.max(1, Math.min(10, demeritCount));
      let created = 0;
      for (let i = 0; i < count; i++) {
        const result = await createDemerit(undefined, formData);
        if (result?.error) {
          setSubmitError(`Created ${created} of ${count} demerits. Error: ${result.error}`);
          return;
        }
        created++;
      }

      // If restriction checkbox is checked, also submit the restriction (after all demerits)
      if (addRestriction) {
        const restrictionData = new FormData();
        restrictionData.set("house_id", formData.get("house_id") as string);
        restrictionData.set("resident_id", formData.get("resident_id") as string);
        restrictionData.set("restriction_type", restrictionType);
        restrictionData.set("description", formData.get("restriction_description") as string || formData.get("reason") as string);
        restrictionData.set("start_date", formData.get("restriction_start") as string || getHouseToday());
        const endDate = formData.get("restriction_end") as string;
        if (endDate) restrictionData.set("end_date", endDate);
        const notes = formData.get("restriction_notes") as string;
        if (notes) restrictionData.set("notes", notes);
        if (restrictionType === "house_commitment") restrictionData.set("is_house_commitment", "on");
        const restrictionResult = await createRestriction(undefined, restrictionData);
        if (restrictionResult?.error) {
          setSubmitError(`Demerits created. Restriction failed: ${restrictionResult.error}`);
          return;
        }
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Issue Demerit</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {preselectedResident ? (
            <>
              {/* Auto-filled from matrix click — no dropdowns */}
              <input type="hidden" name="house_id" value={preselectedResident.house_id} />
              <input type="hidden" name="resident_id" value={preselectedResident.id} />
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span className="font-medium">{preselectedResident.full_name}</span>
                <span className="text-muted-foreground ml-2">
                  — {houses.find((h) => h.id === preselectedResident.house_id)?.name ?? ""}
                </span>
              </div>
            </>
          ) : (
            <>
              {/* Resident selector — house auto-assigned from resident */}
              <div className="space-y-2">
                <Label>Resident *</Label>
                <select
                  name="resident_id"
                  required
                  value={selectedResident}
                  onChange={(e) => setSelectedResident(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">Select resident</option>
                  {residents.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.full_name} — {houses.find((h) => h.id === r.house_id)?.name ?? ""}
                    </option>
                  ))}
                </select>
              </div>
              {/* Hidden house_id — auto-derived from selected resident */}
              <input type="hidden" name="house_id" value={resolvedHouseId} />
              {resolvedHouseName && (
                <p className="text-xs text-muted-foreground -mt-2">House: {resolvedHouseName}</p>
              )}
            </>
          )}

          {/* Demerit Count */}
          <div className="space-y-2">
            <Label>Count</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={10}
                value={demeritCount}
                onChange={(e) => setDemeritCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">
                {demeritCount > 1 ? `Will create ${demeritCount} demerits for this incident` : "1 demerit"}
              </span>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category</Label>
            <Input name="category" placeholder="e.g., Chores, Behavior, Curfew" />
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea name="reason" required rows={2} placeholder="Describe the infraction..." />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea name="notes" rows={2} placeholder="Additional notes (optional)..." />
          </div>

          {/* Hidden points field — default to 1 (count-based) */}
          <input type="hidden" name="points" value="1" />

          {/* Photo */}
          <div className="space-y-2">
            <Label>Photo (optional)</Label>
            <div className="flex items-center gap-2">
              <label
                htmlFor="demerit-photo-matrix"
                className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                {photoFile ? photoFile.name : "Choose photo"}
              </label>
              <input
                id="demerit-photo-matrix"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />
              {uploading && <span className="text-xs text-muted-foreground">Uploading...</span>}
              {photoUrl && <span className="text-xs text-green-600">Uploaded</span>}
            </div>
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
            {photoUrl && <input type="hidden" name="photo_url" value={photoUrl} />}
          </div>

          {/* Add Restriction toggle */}
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="add-restriction-toggle"
                checked={addRestriction}
                onChange={(e) => setAddRestriction(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="add-restriction-toggle" className="text-sm font-medium cursor-pointer">
                Also add a restriction
              </Label>
            </div>

            {addRestriction && (
              <div className="space-y-3 pl-6 border-l-2 border-primary/20">
                <div className="space-y-2">
                  <Label className="text-xs">Restriction Type</Label>
                  <select
                    value={restrictionType}
                    onChange={(e) => setRestrictionType(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                  >
                    {RESTRICTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Restriction Description</Label>
                  <Input name="restriction_description" className="h-8 text-xs" placeholder="e.g., Cannot leave the house" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Start Date</Label>
                    <Input name="restriction_start" type="date" className="h-8 text-xs" defaultValue={getHouseToday()} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End Date</Label>
                    <Input name="restriction_end" type="date" className="h-8 text-xs" />
                    <p className="text-[9px] text-muted-foreground">Blank = indefinite</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Restriction Notes</Label>
                  <Input name="restriction_notes" className="h-8 text-xs" placeholder="Additional restriction notes" />
                </div>
              </div>
            )}
          </div>

          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}
          <Button type="submit" className="w-full" disabled={isPending || uploading}>
            {isPending
              ? "Issuing..."
              : addRestriction
                ? `Issue ${demeritCount > 1 ? `${demeritCount} Demerits` : "Demerit"} + Restriction`
                : `Issue ${demeritCount > 1 ? `${demeritCount} Demerits` : "Demerit"}`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
