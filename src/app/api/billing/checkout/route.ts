import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { priceIdFor, type SubscriptionTier } from "@/lib/billing";
import { getAppOrigin } from "@/lib/app-url";

// POST { tier: "solo" | "house" | "org", interval: "month" | "year" }
// → { url } Stripe Checkout session for the caller's workspace.
export async function POST(req: NextRequest) {
  const user = await requireRole("admin");
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    tier?: string;
    interval?: string;
  } | null;
  const tier = body?.tier as SubscriptionTier | undefined;
  const interval = body?.interval === "year" ? "year" : "month";
  if (tier !== "solo" && tier !== "house" && tier !== "org") {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }
  const priceId = priceIdFor(tier, interval);
  if (!priceId) {
    return NextResponse.json(
      { error: `Missing STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}` },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .select("id, name, stripe_customer_id")
    .eq("id", user.workspace_id)
    .single();
  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  let customerId = ws.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: ws.name,
      email: user.email,
      metadata: { workspace_id: ws.id },
    });
    customerId = customer.id;
    await admin
      .from("workspaces")
      .update({ stripe_customer_id: customerId })
      .eq("id", ws.id);
  }

  const origin = await getAppOrigin();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { workspace_id: ws.id, tier },
    },
    success_url: `${origin}/admin/workspace?tab=billing&checkout=success`,
    cancel_url: `${origin}/admin/workspace?tab=billing`,
    metadata: { workspace_id: ws.id, tier },
  });

  return NextResponse.json({ url: session.url });
}
