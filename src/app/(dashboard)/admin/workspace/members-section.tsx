"use client";

import { useState, useTransition, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getWorkspaceInviteLink,
  regenerateInviteCode,
  approvePendingMember,
  denyPendingMember,
  removeWorkspaceMember,
} from "./actions";
import type { WorkspaceMember } from "@/lib/types";
import { Check, X, RefreshCw, Copy, Link } from "lucide-react";

export function MembersSection({
  members,
  pendingMembers,
}: {
  members: (WorkspaceMember & { user: { email: string; full_name: string } })[];
  pendingMembers: (WorkspaceMember & { user: { email: string; full_name: string } })[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getWorkspaceInviteLink().then((result) => {
      if (result.inviteUrl) setInviteUrl(result.inviteUrl);
    });
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleRegenerate() {
    if (!confirm("Regenerate invite link? The old link will stop working.")) return;
    startTransition(async () => {
      const result = await regenerateInviteCode();
      if (result.error) {
        setMessage(result.error);
      } else {
        const fresh = await getWorkspaceInviteLink();
        if (fresh.inviteUrl) setInviteUrl(fresh.inviteUrl);
        setMessage("Invite link regenerated.");
      }
    });
  }

  function handleApprove(memberId: string) {
    startTransition(async () => {
      const result = await approvePendingMember(memberId);
      if (result.error) setMessage(result.error);
      else setMessage("Member approved.");
    });
  }

  function handleDeny(memberId: string) {
    if (!confirm("Deny this member's request to join?")) return;
    startTransition(async () => {
      const result = await denyPendingMember(memberId);
      if (result.error) setMessage(result.error);
      else setMessage("Member denied.");
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
      {/* Invite Link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Invite Link
          </CardTitle>
          <CardDescription>
            Share this link with people to let them request to join your
            workspace. They&apos;ll need your approval before gaining access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {inviteUrl && (
            <div className="flex gap-2">
              <Input value={inviteUrl} readOnly className="text-xs font-mono" />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="shrink-0"
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={pending}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Regenerate Link
            </Button>
            <p className="text-xs text-muted-foreground">
              This invalidates the previous link.
            </p>
          </div>
          {message && (
            <p
              className={`text-sm ${message.toLowerCase().includes("error") || message.toLowerCase().includes("not") ? "text-destructive" : "text-green-600"}`}
            >
              {message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Pending Approval */}
      {pendingMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Pending Approval
              <Badge variant="secondary">{pendingMembers.length}</Badge>
            </CardTitle>
            <CardDescription>
              These users signed up via the invite link and are waiting for your
              approval.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {pendingMembers.map((m) => (
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
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleApprove(m.id)}
                      disabled={pending}
                      className="text-green-700 hover:text-green-800 hover:bg-green-50"
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeny(m.id)}
                      disabled={pending}
                      className="text-destructive hover:text-destructive"
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Deny
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Members */}
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
    </div>
  );
}
