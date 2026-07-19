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
import { updatePaymentConfig } from "./actions";
import type {
  WorkspacePaymentConfig,
  PaymentFrequencyOption,
  PaymentMethod,
} from "@/lib/types";

const FREQUENCY_OPTIONS: { value: PaymentFrequencyOption; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "bi-weekly", label: "Bi-Weekly" },
  { value: "monthly", label: "Monthly" },
];

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "venmo", label: "Venmo" },
  { value: "zelle", label: "Zelle" },
  { value: "check", label: "Check" },
  { value: "money_order", label: "Money Order" },
  { value: "other", label: "Other" },
];

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export function PaymentConfigSection({
  workspaceId,
  config,
}: {
  workspaceId: string;
  config: WorkspacePaymentConfig | null;
}) {
  const [rentAmount, setRentAmount] = useState(
    config?.default_rent_amount?.toString() ?? "0"
  );
  const [weeklyRentAmount, setWeeklyRentAmount] = useState(
    config?.default_weekly_rent_amount?.toString() ?? "0"
  );
  const [frequency, setFrequency] = useState<PaymentFrequencyOption>(
    config?.payment_frequency ?? "weekly"
  );
  const [dueDay, setDueDay] = useState(config?.payment_due_day ?? "monday");
  const [methods, setMethods] = useState<PaymentMethod[]>(
    config?.accepted_methods ?? ["cash"]
  );
  const [lateFee, setLateFee] = useState(
    config?.late_fee_amount?.toString() ?? "0"
  );
  const [gracePeriod, setGracePeriod] = useState(
    config?.grace_period_days?.toString() ?? "0"
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function toggleMethod(method: PaymentMethod) {
    setMethods((prev) =>
      prev.includes(method)
        ? prev.filter((m) => m !== method)
        : [...prev, method]
    );
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updatePaymentConfig(workspaceId, {
        default_rent_amount: parseFloat(rentAmount) || 0,
        default_weekly_rent_amount: parseFloat(weeklyRentAmount) || 0,
        payment_frequency: frequency,
        payment_due_day: dueDay,
        accepted_methods: methods.length > 0 ? methods : ["cash"],
        late_fee_amount: parseFloat(lateFee) || 0,
        grace_period_days: parseInt(gracePeriod) || 0,
      });
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
        <CardTitle>Payment Configuration</CardTitle>
        <CardDescription>
          Set default rent amounts, payment frequency, and collection methods
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="rent-amount">Default Monthly Rent ($)</Label>
            <Input
              id="rent-amount"
              type="number"
              min="0"
              step="0.01"
              value={rentAmount}
              onChange={(e) => setRentAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="weekly-rent-amount">Default Weekly Rent ($)</Label>
            <Input
              id="weekly-rent-amount"
              type="number"
              min="0"
              step="0.01"
              value={weeklyRentAmount}
              onChange={(e) => setWeeklyRentAmount(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="frequency">Payment Frequency</Label>
            <select
              id="frequency"
              value={frequency}
              onChange={(e) =>
                setFrequency(e.target.value as PaymentFrequencyOption)
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="due-day">
            Payment Due Day{" "}
            <span className="text-muted-foreground font-normal">
              ({frequency === "monthly" ? "day of month" : "day of week"})
            </span>
          </Label>
          {frequency === "monthly" ? (
            <Input
              id="due-day"
              type="number"
              min="1"
              max="28"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              placeholder="1-28"
            />
          ) : (
            <select
              id="due-day"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {WEEKDAYS.map((day) => (
                <option key={day} value={day}>
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="space-y-2">
          <Label>Accepted Payment Methods</Label>
          <div className="flex flex-wrap gap-2">
            {METHOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleMethod(opt.value)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  methods.includes(opt.value)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="late-fee">Late Fee Amount ($)</Label>
            <Input
              id="late-fee"
              type="number"
              min="0"
              step="0.01"
              value={lateFee}
              onChange={(e) => setLateFee(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="grace-period">Grace Period (days)</Label>
            <Input
              id="grace-period"
              type="number"
              min="0"
              value={gracePeriod}
              onChange={(e) => setGracePeriod(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Days after due date before late fee applies
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving..." : "Save Changes"}
          </Button>
          {message && (
            <p
              className={`text-sm ${message === "Saved" ? "text-green-600" : "text-destructive"}`}
            >
              {message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
