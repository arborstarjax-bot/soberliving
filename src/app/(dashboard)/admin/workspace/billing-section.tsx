"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TIERS, type WorkspaceBilling } from "@/lib/billing";

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  trialing: { label: "Trial", tone: "bg-blue-100 text-blue-800" },
  active: { label: "Active", tone: "bg-green-100 text-green-800" },
  past_due: { label: "Past due", tone: "bg-amber-100 text-amber-800" },
  canceled: { label: "Canceled", tone: "bg-red-100 text-red-800" },
};

export function BillingSection({ billing }: { billing: WorkspaceBilling }) {
  const [pending, setPending] = useState<string | null>(null);
  const [interval, setInterval] = useState<"month" | "year">("month");

  const status = billing.subscription_status;
  const statusMeta = status ? STATUS_LABELS[status] : null;
  const trialDaysLeft = billing.trial_ends_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(billing.trial_ends_at).getTime() - Date.now()) / 86400000
        )
      )
    : null;

  async function open(url: string, body?: Record<string, string>) {
    setPending(url + (body?.tier ?? ""));
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          Subscription
          {statusMeta && (
            <Badge className={statusMeta.tone}>{statusMeta.label}</Badge>
          )}
          {!status && <Badge variant="secondary">Legacy</Badge>}
        </CardTitle>
        <CardDescription>
          {status === "trialing" && trialDaysLeft !== null
            ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your trial`
            : status === "past_due"
              ? "Payment failed — update your card to keep access"
              : status === "canceled"
                ? "Subscription canceled — choose a plan to reactivate"
                : billing.subscription_tier
                  ? `${TIERS[billing.subscription_tier as keyof typeof TIERS]?.label ?? billing.subscription_tier} plan`
                  : "Workspace predates billing — no limits apply"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(status === "past_due" || status === "canceled") && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {status === "past_due"
              ? "Your last payment failed. Update your payment method below — access stays on for now."
              : "This workspace's subscription is canceled. Data stays readable; pick a plan to reactivate fully."}
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Billing:</span>
          {(["month", "year"] as const).map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInterval(i)}
              className={`rounded-md px-2.5 py-1 text-sm font-medium ${
                interval === i
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              {i === "month" ? "Monthly" : "Yearly (2 months free)"}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(TIERS) as (keyof typeof TIERS)[]).map((tier) => {
            const t = TIERS[tier];
            const price =
              interval === "year" ? t.monthlyUsd * 10 : t.monthlyUsd;
            const isCurrent = billing.subscription_tier === tier;
            return (
              <div
                key={tier}
                className="rounded-lg border p-4 flex flex-col gap-2"
              >
                <div className="font-medium">
                  {t.label}
                  {isCurrent && (
                    <Badge variant="secondary" className="ml-2">
                      Current
                    </Badge>
                  )}
                </div>
                <div className="text-2xl font-bold">
                  ${price}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{interval === "year" ? "yr" : "mo"}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {t.houseLimit === null
                    ? "Unlimited houses"
                    : `Up to ${t.houseLimit} house${t.houseLimit === 1 ? "" : "s"}`}
                </div>
                {!isCurrent && (
                  <Button
                    size="sm"
                    variant={status ? "outline" : "default"}
                    disabled={pending !== null}
                    onClick={() =>
                      open("/api/billing/checkout", { tier, interval })
                    }
                  >
                    {pending === `/api/billing/checkout${tier}`
                      ? "…"
                      : status
                        ? "Switch"
                        : "Choose"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {billing.stripe_customer_id && (
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() => open("/api/billing/portal")}
          >
            Manage billing (card, invoices, cancel)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
