"use client";

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  sendWorkspaceInvite,
  revokeWorkspaceInvite,
  removeWorkspaceMember,
} from "./actions";
import type { WorkspaceInvite, WorkspaceMember } from "@/lib/types";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "resident", label: "Resident" },
];

export function MembersSection({
  workspaceId,
  members,
  invites,
}: {
  workspaceId: string;
  members: (WorkspaceMember & { user: { email: string; full_name: string } })[];
  invites: WorkspaceInvite[];
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("resident");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  function handleInvite() {
    if (!email.trim()) return;
    startTransition(async () => {
      const result = await sendWorkspaceInvite(workspaceId, email.trim(), role);
      if (result.error) {
        setMessage(result.error);
        setInviteUrl("");
      } else if (result.inviteUrl) {
        setInviteUrl(result.inviteUrl);
        setMessage("Invite created! Share the link below.");
        setEmail("");
      }
    });
  }

  function handleRevoke(inviteId: string) {
    startTransition(async () => {
      const result = await revokeWorkspaceInvite(inviteId);
      if (result.error) setMessage(result.error);
    });
  }

  function handleRemove(memberId: string) {
    if (!confirm("Remove this member from the workspace?")) return;
    startTransition(async () => {
      const result = await removeWorkspaceMember(memberId);
      if (result.error) setMessage(result.error);
    });
  }

  return (
    <div className="space-y-6">
      {/* Invite new member */}
      <Card>
        <CardHeader>
          <CardTitle>Invite Member</CardTitle>
          <CardDescription>
            Send an invite link to add someone to this workspace
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button onClick={handleInvite} disabled={pending || !email.trim()}>
            {pending ? "Sending..." : "Send Invite"}
          </Button>
          {message && (
            <p
              className={`text-sm ${message.includes("created") ? "text-green-600" : "text-destructive"}`}
            >
              {message}
            </p>
          )}
          {inviteUrl && (
            <div className="rounded-md border bg-muted p-3 space-y-2">
              <p className="text-sm font-medium">Invite Link</p>
              <div className="flex gap-2">
                <Input value={inviteUrl} readOnly className="text-xs" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(inviteUrl)}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This link expires in 7 days.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current Members */}
      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <div className="divide-y">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium">{m.user.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.user.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                      {m.role}
                    </Badge>
                    {m.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(m.id)}
                        disabled={pending}
                        className="text-destructive hover:text-destructive"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invites ({invites.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires{" "}
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{inv.role}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(inv.id)}
                      disabled={pending}
                      className="text-destructive hover:text-destructive"
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
