"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "./actions";

export function ProfileForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function handleSave() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await updateProfile(name.trim());
      if ("error" in result && result.error) {
        setMessage(result.error);
      } else {
        setMessage("Saved");
        setTimeout(() => setMessage(""), 2000);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="full_name">Full Name</Label>
        <Input
          id="full_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={pending} size="sm">
          {pending ? "Saving..." : "Update Name"}
        </Button>
        {message && (
          <p className={`text-sm ${message === "Saved" ? "text-green-600" : "text-destructive"}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
