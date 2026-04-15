"use client";

import { useActionState, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateUserProfile,
  deleteUser,
  resendInviteLink,
  assignManagerToHouses,
} from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Mail, Trash2, Send } from "lucide-react";

interface ResidentProfile {
  id: string;
  houseId: string;
  moveInDate: string;
  sobrietyDate: string;
  dateOfBirth: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  forcePhoto: boolean;
}

interface Props {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  isResident: boolean;
  isActive: boolean;
  isSelf: boolean;
  houses: { id: string; name: string }[];
  assignedHouseIds: string[];
  residentProfile: ResidentProfile | null;
}

export function UserProfileForm({
  userId,
  fullName,
  email,
  phone,
  role,
  isResident,
  isActive,
  isSelf,
  houses,
  assignedHouseIds,
  residentProfile,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isResidentChecked, setIsResidentChecked] = useState(isResident);

  // Profile update form
  const boundUpdate = updateUserProfile.bind(null, userId);
  const [profileState, profileAction, profilePending] = useActionState(
    boundUpdate,
    undefined
  );

  // House assignment form
  const [assignState, assignAction, assignPending] = useActionState(
    assignManagerToHouses,
    undefined
  );

  // Resend invite
  const [showResendResult, setShowResendResult] = useState(false);
  const [resendResult, setResendResult] = useState<{
    inviteLink?: string;
    emailSent?: boolean;
    emailError?: string | null;
    error?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);

  function handleResend() {
    startTransition(async () => {
      const result = await resendInviteLink(userId);
      setResendResult(result);
      setShowResendResult(true);
      setShowLink(false);
      setCopied(false);
    });
  }

  function copyLink() {
    if (resendResult?.inviteLink) {
      navigator.clipboard.writeText(resendResult.inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleDelete() {
    if (
      confirm(
        "Permanently delete this user? This removes them from the database and cannot be undone."
      )
    ) {
      startTransition(async () => {
        const result = await deleteUser(userId);
        if (!result.error) {
          router.push("/users");
        }
      });
    }
  }

  const showResidentFields = isResidentChecked || role === "resident";

  return (
    <div className="space-y-6">
      {/* Profile Edit Card */}
      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={profileAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  defaultValue={fullName}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={email}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={phone}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                {isSelf ? (
                  <>
                    <Input value={role} disabled className="bg-muted capitalize" />
                    <p className="text-xs text-muted-foreground">
                      Cannot change your own role
                    </p>
                  </>
                ) : (
                  <select
                    id="role"
                    name="role"
                    defaultValue={role}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  >
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="resident">Resident</option>
                  </select>
                )}
              </div>
            </div>

            {/* Is Resident Checkbox */}
            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="is_resident"
                name="is_resident"
                checked={isResidentChecked}
                onChange={(e) => setIsResidentChecked(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="is_resident" className="font-normal">
                This user is also a resident{" "}
                <span className="text-muted-foreground">
                  (eligible for chores, bed assignments, leave, payments)
                </span>
              </Label>
            </div>

            {/* Resident Profile Fields */}
            {showResidentFields && (
              <div className="border-t pt-4 space-y-4">
                <p className="text-sm font-medium">
                  Resident Profile
                  {!residentProfile && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      Not yet created — fill in and save to create
                    </Badge>
                  )}
                </p>

                <div className="space-y-2">
                  <Label>House *</Label>
                  <select
                    name="resident_house_id"
                    required={showResidentFields}
                    defaultValue={residentProfile?.houseId ?? ""}
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
                      name="resident_move_in_date"
                      type="date"
                      required={showResidentFields}
                      defaultValue={
                        residentProfile?.moveInDate ??
                        new Date().toISOString().split("T")[0]
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Sobriety Date</Label>
                    <Input
                      name="resident_sobriety_date"
                      type="date"
                      defaultValue={residentProfile?.sobrietyDate ?? ""}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <Input
                    name="resident_date_of_birth"
                    type="date"
                    defaultValue={residentProfile?.dateOfBirth ?? ""}
                  />
                </div>

                {/* Force Photo (disciplinary) */}
                <div className="flex items-center gap-3 rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/10 p-3">
                  <input
                    type="checkbox"
                    id="resident_force_photo"
                    name="resident_force_photo"
                    defaultChecked={residentProfile?.forcePhoto ?? false}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor="resident_force_photo" className="font-normal">
                    <span className="font-medium">Force Photo Required</span>
                    <span className="text-muted-foreground text-xs block">
                      Disciplinary: resident must upload a photo when completing any chore
                    </span>
                  </Label>
                </div>

                <div className="border-t pt-3">
                  <p className="text-sm font-medium mb-3">Emergency Contact</p>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Emergency Contact Name *</Label>
                      <Input
                        name="resident_emergency_contact_name"
                        required={showResidentFields}
                        defaultValue={
                          residentProfile?.emergencyContactName ?? ""
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Emergency Phone *</Label>
                        <Input
                          name="resident_emergency_contact_phone"
                          type="tel"
                          required={showResidentFields}
                          defaultValue={
                            residentProfile?.emergencyContactPhone ?? ""
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Relationship</Label>
                        <Input
                          name="resident_emergency_contact_relationship"
                          defaultValue={
                            residentProfile?.emergencyContactRelationship ?? ""
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {profileState?.error && (
              <p className="text-sm text-destructive">{profileState.error}</p>
            )}

            <Button type="submit" disabled={profilePending}>
              {profilePending ? "Saving\u2026" : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* House Assignment Card */}
      <Card>
        <CardHeader>
          <CardTitle>House Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Select which houses this user manages. This applies to managers and
            admins.
          </p>
          <form action={assignAction} className="space-y-4">
            <input type="hidden" name="user_id" value={userId} />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {houses.map((house) => (
                <label
                  key={house.id}
                  className="flex items-center gap-2 text-sm rounded-md border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                >
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
              {houses.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full">
                  No houses available.
                </p>
              )}
            </div>
            {assignState?.error && (
              <p className="text-sm text-destructive">{assignState.error}</p>
            )}
            <Button type="submit" variant="outline" disabled={assignPending}>
              {assignPending ? "Saving\u2026" : "Save House Assignments"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={isPending}
              onClick={handleResend}
            >
              <Send className="mr-2 h-4 w-4" />
              {isPending ? "Sending\u2026" : "Resend Password Link"}
            </Button>

            {!isSelf && (
              <Button
                variant="destructive"
                disabled={isPending}
                onClick={handleDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete User Permanently
              </Button>
            )}
          </div>

          {!isActive && (
            <div className="mt-4">
              <Badge variant="destructive">This user is deactivated</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resend Result Dialog */}
      <Dialog open={showResendResult} onOpenChange={setShowResendResult}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password Reset Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {resendResult?.error ? (
              <p className="text-sm text-destructive">{resendResult.error}</p>
            ) : (
              <>
                {resendResult?.emailSent ? (
                  <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                    <Mail className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-800">
                        Email sent successfully
                      </p>
                      <p className="text-xs text-green-600 mt-0.5">
                        A new password reset link has been sent to the user.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Link generated. Share it with the user so they can set
                      their password.
                    </p>
                    {resendResult?.emailError && (
                      <p className="text-xs text-destructive">
                        Email failed: {resendResult.emailError}
                      </p>
                    )}
                  </div>
                )}

                {showLink ? (
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={resendResult?.inviteLink ?? ""}
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
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowLink(true)}
                    className="w-full"
                  >
                    <Copy className="mr-2 h-4 w-4" /> Show & Copy Link
                  </Button>
                )}
              </>
            )}

            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setShowResendResult(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
