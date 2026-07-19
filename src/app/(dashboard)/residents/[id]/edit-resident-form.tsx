"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";
import { updateResident } from "../actions";
import { changeUserRole, assignManagerToHouses } from "../../users/actions";
import { getHouseToday } from "@/lib/timezone";

interface EditResidentFormProps {
  residentId: string;
  resident: {
    full_name: string;
    phone: string | null;
    email: string | null;
    date_of_birth: string | null;
    sobriety_date: string | null;
    move_in_date: string;
    move_out_date: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    emergency_contact_relationship: string | null;
    notes: string | null;
  };
  userId?: string | null;
  currentRole?: string | null;
  isAdmin?: boolean;
  houses?: { id: string; name: string }[];
  assignedHouseIds?: string[];
}

export function EditResidentForm({ residentId, resident, userId, currentRole, isAdmin, houses, assignedHouseIds }: EditResidentFormProps) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedRole, setSelectedRole] = useState(currentRole ?? "resident");
  const [selectedHouses, setSelectedHouses] = useState<Set<string>>(new Set(assignedHouseIds ?? []));

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateResident(residentId, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }

      // Update role if admin changed it
      const newRole = formData.get("role") as string | null;
      if (isAdmin && userId && newRole && newRole !== currentRole) {
        const roleResult = await changeUserRole(userId, newRole);
        if (roleResult?.error) {
          setError(roleResult.error);
          return;
        }
      }

      // Update house assignments if role is manager
      if (isAdmin && userId && newRole === "manager") {
        const houseFormData = new FormData();
        houseFormData.append("user_id", userId);
        for (const houseId of selectedHouses) {
          houseFormData.append("house_ids", houseId);
        }
        const houseResult = await assignManagerToHouses(undefined, houseFormData);
        if (houseResult?.error) {
          setError(houseResult.error);
          return;
        }
      }

      setSuccess(true);
      setEditing(false);
      setTimeout(() => setSuccess(false), 3000);
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing(true)}
          className="gap-1.5"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit Info
        </Button>
        {success && <span className="text-xs text-green-600">Saved</span>}
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-5 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Edit Resident Info</h3>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">{error}</p>}

      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Personal</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full Name</Label>
            <Input id="full_name" name="full_name" defaultValue={resident.full_name} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={resident.phone ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={resident.email ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date_of_birth">Date of Birth</Label>
            <Input id="date_of_birth" name="date_of_birth" type="date" defaultValue={resident.date_of_birth ?? ""} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Residency</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sobriety_date">Sobriety Date</Label>
            <Input
              id="sobriety_date"
              name="sobriety_date"
              type="date"
              defaultValue={resident.sobriety_date ?? ""}
              max={getHouseToday()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="move_in_date">Move-in Date</Label>
            <Input id="move_in_date" name="move_in_date" type="date" defaultValue={resident.move_in_date} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="move_out_date">Move-out Date</Label>
            <Input id="move_out_date" name="move_out_date" type="date" defaultValue={resident.move_out_date ?? ""} />
          </div>
          {isAdmin && userId && (
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                name="role"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="resident">Resident</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          )}
          {isAdmin && selectedRole === "manager" && houses && houses.length > 0 && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Manages Houses</Label>
              <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
                {houses.map((house) => (
                  <label key={house.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedHouses.has(house.id)}
                      onChange={() => {
                        setSelectedHouses((prev) => {
                          const next = new Set(prev);
                          if (next.has(house.id)) next.delete(house.id);
                          else next.add(house.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 rounded border-input"
                    />
                    {house.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emergency Contact</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="emergency_contact_name">Name</Label>
            <Input id="emergency_contact_name" name="emergency_contact_name" defaultValue={resident.emergency_contact_name ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emergency_contact_phone">Phone</Label>
            <Input id="emergency_contact_phone" name="emergency_contact_phone" defaultValue={resident.emergency_contact_phone ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emergency_contact_relationship">Relationship</Label>
            <Input id="emergency_contact_relationship" name="emergency_contact_relationship" defaultValue={resident.emergency_contact_relationship ?? ""} />
          </div>
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Intake Notes</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={resident.notes ?? ""} />
      </div>
    </form>
  );
}
