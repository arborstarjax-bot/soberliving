"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserCheck, UserX } from "lucide-react";
import type { UserRole } from "@/lib/types";
import { approvePendingUser, rejectPendingUser } from "./actions";

interface PendingUser {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
}

export function PendingUsersList({ users }: { users: PendingUser[] }) {
  if (users.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No pending signups.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {users.map((u) => (
        <PendingUserRow key={u.id} user={u} />
      ))}
    </div>
  );
}

function PendingUserRow({ user }: { user: PendingUser }) {
  const [role, setRole] = useState<UserRole>("resident");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onApprove = () => {
    setError(null);
    startTransition(async () => {
      const res = await approvePendingUser(user.id, role);
      if (res.error) setError(res.error);
    });
  };

  const onReject = () => {
    setError(null);
    if (
      !window.confirm(
        `Reject ${user.full_name}? They will not be able to sign in.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await rejectPendingUser(user.id);
      if (res.error) setError(res.error);
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{user.full_name}</CardTitle>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Badge variant="outline">
            Signed up {new Date(user.created_at).toLocaleDateString()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 pt-0">
        <label className="flex items-center gap-2 text-sm">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
            disabled={isPending}
          >
            <option value="resident">Resident</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          onClick={onApprove}
          disabled={isPending}
        >
          <UserCheck className="mr-1 h-4 w-4" />
          {isPending ? "Working..." : "Approve"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onReject}
          disabled={isPending}
          className="text-destructive"
        >
          <UserX className="mr-1 h-4 w-4" />
          Reject
        </Button>
        {error && (
          <p className="w-full text-sm text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
