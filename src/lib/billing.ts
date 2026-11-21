// Workspace billing model shared by the Billing tab, checkout/portal
// routes, webhook sync, and the house-limit check in createHouse.

export type SubscriptionTier = "solo" | "house" | "org";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export interface WorkspaceBilling {
  subscription_tier: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
}

export const TIERS: Record<
  SubscriptionTier,
  { label: string; monthlyUsd: number; houseLimit: number | null }
> = {
  solo: { label: "Solo", monthlyUsd: 29, houseLimit: 1 },
  house: { label: "House", monthlyUsd: 59, houseLimit: 3 },
  org: { label: "Org", monthlyUsd: 119, houseLimit: null },
};

export function tierLabel(tier: string | null): string {
  if (tier === "solo" || tier === "house" || tier === "org") {
    return TIERS[tier].label;
  }
  return "Legacy";
}

/** Houses the tier permits; null = unlimited (legacy + org). */
export function houseLimitFor(tier: string | null): number | null {
  if (tier === "solo") return TIERS.solo.houseLimit;
  if (tier === "house") return TIERS.house.houseLimit;
  return null;
}

/** Stripe price ids, read from env at call time so tests can stub. */
export function priceIdFor(
  tier: SubscriptionTier,
  interval: "month" | "year"
): string | null {
  const key = `STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}`;
  return process.env[key] ?? null;
}

/** Reverse lookup used by the webhook to map a price id back to a tier. */
export function tierForPriceId(priceId: string): SubscriptionTier | null {
  for (const tier of ["solo", "house", "org"] as const) {
    if (
      priceIdFor(tier, "month") === priceId ||
      priceIdFor(tier, "year") === priceId
    ) {
      return tier;
    }
  }
  return null;
}
