"use client";

import { useActionState, useState } from "react";
import { createUser } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Copy, Check, Mail } from "lucide-react";

interface Props {
  houses: { id: string; name: string }[];
}

export function CreateUserDialog({ houses }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createUser, undefined);
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [selectedRole, setSelectedRole] = useState("resident");
  const [isResident, setIsResident] = useState(true);

  const showResidentFields = isResident || selectedRole === "resident";

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCopied(false);
      setShowLink(false);
      setSelectedRole("resident");
      setIsResident(true);
    }
  }

  async function copyLink() {
    if (state?.inviteLink) {
      await navigator.clipboard.writeText(state.inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" />
        Add User
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {state?.inviteLink ? "User Created" : "Create User"}
          </DialogTitle>
        </DialogHeader>

        {state?.inviteLink ? (
          <div className="space-y-4">
            {state.emailSent ? (
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                <Mail className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-800">
                    Invite email sent
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">
                    The user will receive an email with a link to set their
                    password.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  User created successfully. Share the invite link below so they
                  can set their password.
                </p>
                {state.emailError && (
                  <p className="text-xs text-destructive">
                    Email failed: {state.emailError}
                  </p>
                )}
              </div>
            )}

            {showLink ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={state.inviteLink}
                    className="text-xs font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyLink}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This link expires in 24 hours.
                </p>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowLink(true)}
                className="w-full"
              >
                <Copy className="mr-2 h-4 w-4" />
                Show & Copy Invite Link
              </Button>
            )}

            <Button
              type="button"
              className="w-full"
              onClick={() => handleOpenChange(false)}
            >
              Done
            </Button>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input name="full_name" required />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input name="phone" />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <select
                name="role"
                required
                value={selectedRole}
                onChange={(e) => {
                  setSelectedRole(e.target.value);
                  if (e.target.value === "resident") setIsResident(true);
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="resident">Resident</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {selectedRole !== "resident" && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_resident"
                  name="is_resident"
                  checked={isResident}
                  onChange={(e) => setIsResident(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="is_resident" className="text-sm font-normal">
                  Also a resident (eligible for chores, bed assignments, leave)
                </Label>
              </div>
            )}

            {/* Resident-specific fields */}
            {showResidentFields && (
              <div className="border-t pt-4 space-y-4">
                <p className="text-sm font-medium">Resident Information</p>

                <div className="space-y-2">
                  <Label>House *</Label>
                  <select
                    name="house_id"
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    <option value="">Select house</option>
                    {houses.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Move-in Date *</Label>
                    <Input
                      name="move_in_date"
                      type="date"
                      required
                      defaultValue={new Date().toISOString().split("T")[0]}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Sobriety Date</Label>
                    <Input name="sobriety_date" type="date" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <Input name="date_of_birth" type="date" />
                </div>

                <div className="border-t pt-3">
                  <p className="text-sm font-medium mb-3">Emergency Contact</p>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Emergency Contact Name *</Label>
                      <Input name="emergency_contact_name" required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Emergency Phone *</Label>
                        <Input
                          name="emergency_contact_phone"
                          type="tel"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Relationship</Label>
                        <Input name="emergency_contact_relationship" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              An invite email will be sent automatically with a link to set
              their password.
            </p>
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Creating…" : "Create & Send Invite"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
