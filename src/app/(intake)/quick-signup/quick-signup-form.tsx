"use client";

import { useActionState } from "react";
import { submitQuickSignup } from "@/app/(intake)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function QuickSignupForm() {
  const [state, action, pending] = useActionState(submitQuickSignup, undefined);

  const today = new Date().toISOString().split("T")[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Welcome! Let&apos;s get you set up</CardTitle>
        <CardDescription>
          Fill out the information below to complete your signup.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-6">
          {/* Full Name */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name</Label>
              <Input id="first_name" name="first_name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name</Label>
              <Input id="last_name" name="last_name" required />
            </div>
          </div>

          {/* Contact */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" name="phone" type="tel" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
          </div>

          {/* Sobriety Date */}
          <div className="space-y-2">
            <Label htmlFor="sobriety_date">Sobriety Date</Label>
            <Input id="sobriety_date" name="sobriety_date" type="date" />
            <p className="text-xs text-muted-foreground">
              Optional — leave blank if not applicable.
            </p>
          </div>

          {/* Emergency Contact */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Emergency Contact</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="emergency_name">Name</Label>
                <Input id="emergency_name" name="emergency_name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergency_phone">Phone</Label>
                <Input
                  id="emergency_phone"
                  name="emergency_phone"
                  type="tel"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="emergency_relationship">Relationship</Label>
              <Input
                id="emergency_relationship"
                name="emergency_relationship"
                placeholder="e.g. Parent, Sibling, Friend"
              />
            </div>
          </div>

          {/* Move-in Date */}
          <div className="space-y-2">
            <Label htmlFor="move_in_date">Move-in Date</Label>
            <Input
              id="move_in_date"
              name="move_in_date"
              type="date"
              defaultValue={today}
              required
            />
          </div>

          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Submitting..." : "Complete Signup"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
