"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "./actions";

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function handleSubmit() {
    setMessage("");
    setIsError(false);

    if (!newPassword || newPassword.length < 8) {
      setMessage("Password must be at least 8 characters");
      setIsError(true);
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match");
      setIsError(true);
      return;
    }

    startTransition(async () => {
      const result = await changePassword(currentPassword, newPassword);
      if ("error" in result && result.error) {
        setMessage(result.error);
        setIsError(true);
      } else {
        setMessage("Password updated");
        setIsError(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setMessage(""), 3000);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new_password">New Password</Label>
        <Input
          id="new_password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm_password">Confirm New Password</Label>
        <Input
          id="confirm_password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleSubmit} disabled={pending} size="sm">
          {pending ? "Updating..." : "Change Password"}
        </Button>
        {message && (
          <p className={`text-sm ${isError ? "text-destructive" : "text-green-600"}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
