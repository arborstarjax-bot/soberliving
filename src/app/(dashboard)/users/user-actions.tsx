"use client";

import { useTransition, useState } from "react";
import {
  changeUserRole,
  deleteUser,
  resendInviteLink,
  assignManagerToHouses,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { MoreVertical, Copy, Check, Mail } from "lucide-react";
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
  const [showResendResult, setShowResendResult] = useState(false);
  const [resendResult, setResendResult] = useState<{
    inviteLink?: string;
    emailSent?: boolean;
    emailError?: string | null;
    error?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [assignState, assignAction, assignPending] = useActionState(
    assignManagerToHouses,
    undefined
  );

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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Role changes */}
          {currentRole !== "admin" && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() =>
                startTransition(() => {
                  changeUserRole(userId, "admin");
                })
              }
            >
              Set as Admin
            </DropdownMenuItem>
          )}
          {currentRole !== "manager" && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() =>
                startTransition(() => {
                  changeUserRole(userId, "manager");
                })
              }
            >
              Set as Manager
            </DropdownMenuItem>
          )}
          {currentRole !== "resident" && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() =>
                startTransition(() => {
                  changeUserRole(userId, "resident");
                })
              }
            >
              Set as Resident
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {/* House assignment */}
          {(currentRole === "manager" || currentRole === "admin") && (
            <DropdownMenuItem onClick={() => setShowHouseAssign(true)}>
              Assign Houses
            </DropdownMenuItem>
          )}

          {/* Resend invite link */}
          <DropdownMenuItem disabled={isPending} onClick={handleResend}>
            Resend Password Link
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Delete user */}
          <DropdownMenuItem
            className="text-destructive"
            disabled={isPending}
            onClick={() => {
              if (
                confirm(
                  "Permanently delete this user? This removes them from the database and cannot be undone."
                )
              ) {
                startTransition(() => {
                  deleteUser(userId);
                });
              }
            }}
          >
            Delete Permanently
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* House Assignment Dialog */}
      <Dialog open={showHouseAssign} onOpenChange={setShowHouseAssign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Houses</DialogTitle>
          </DialogHeader>
          <form action={assignAction} className="space-y-4">
            <input type="hidden" name="user_id" value={userId} />
            <div className="space-y-2">
              {houses.map((house) => (
                <label
                  key={house.id}
                  className="flex items-center gap-2 text-sm"
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
                <p className="text-sm text-muted-foreground">
                  No houses available.
                </p>
              )}
            </div>
            {assignState?.error && (
              <p className="text-sm text-destructive">{assignState.error}</p>
            )}
            <Button type="submit" className="w-full" disabled={assignPending}>
              {assignPending ? "Saving\u2026" : "Save Assignments"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
    </>
  );
}
