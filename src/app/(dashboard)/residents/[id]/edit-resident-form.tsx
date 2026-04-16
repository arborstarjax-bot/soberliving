"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";
import { updateResident } from "../actions";
import { changeUserRole } from "../../users/actions";

interface EditResidentFormProps {
  residentId: string;
  resident: {
    full_name: string;
    phone: string | null;
    email: string | null;
    date_of_birth: string | null;
    sobriety_date: string | null;
    move_in_date: string;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    emergency_contact_relationship: string | null;
    notes: string | null;
  };
  userId?: string | null;
  currentRole?: string | null;
  isAdmin?: boolean;
}

export function EditResidentForm({ residentId, resident, userId, currentRole, isAdmin }: EditResidentFormProps) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
    <form action={handleSubmit} className="space-y-4 border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Edit Resident Info</h3>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

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
          <Label htmlFor="sobriety_date">Sobriety Date</Label>
          <Input id="sobriety_date" name="sobriety_date" type="date" defaultValue={resident.sobriety_date ?? ""} />
        </div>
        {isAdmin && userId && (
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              name="role"
              defaultValue={currentRole ?? "resident"}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="resident">Resident</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        )}
      </div>

      <div className="border-t pt-4">
        <p className="text-sm font-medium mb-3">Emergency Contact</p>
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
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Intake Notes</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={resident.notes ?? ""} />
      </div>
    </form>
  );
}
