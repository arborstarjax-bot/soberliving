"use client";

import { useState, useTransition } from "react";
import { updateUserProfile } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  userId: string;
  initialName: string;
  initialEmail: string;
  initialPhone: string;
  initialRole: string;
}

export function UserProfileForm({
  userId,
  initialName,
  initialEmail,
  initialPhone,
  initialRole,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [role, setRole] = useState(initialRole);

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        setSuccess(false);
        formData.append("user_id", userId);
        startTransition(async () => {
          const result = await updateUserProfile(undefined, formData);
          if (result?.error) {
            setError(result.error);
          } else {
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
          }
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Full Name</Label>
          <Input name="full_name" defaultValue={initialName} required />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={initialEmail} disabled />
          <p className="text-xs text-muted-foreground">Email cannot be changed</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input name="phone" defaultValue={initialPhone} />
        </div>
        <div className="space-y-2">
          <Label>Role</Label>
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          >
            <option value="resident">Resident</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">Changes saved</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
