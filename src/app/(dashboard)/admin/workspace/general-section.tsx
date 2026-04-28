"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateWorkspaceName } from "./actions";
import type { Workspace } from "@/lib/types";

export function GeneralSection({ workspace }: { workspace: Workspace }) {
  const [name, setName] = useState(workspace.name);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function handleSave() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await updateWorkspaceName(workspace.id, name.trim());
      if (result.error) {
        setMessage(result.error);
      } else {
        setMessage("Saved");
        setTimeout(() => setMessage(""), 2000);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ws-name">Workspace Name</Label>
          <Input
            id="ws-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
          {message && (
            <p className={`text-sm ${message === "Saved" ? "text-green-600" : "text-destructive"}`}>
              {message}
            </p>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          <p>Workspace ID: {workspace.id}</p>
          <p>Slug: {workspace.slug}</p>
          <p>Created: {new Date(workspace.created_at).toLocaleDateString()}</p>
        </div>
      </CardContent>
    </Card>
  );
}
