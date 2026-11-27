import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { tierForPriceId } from "@/lib/billing";

// Stripe → workspace sync. Unauthenticated: verified by
// STRIPE_WEBHOOK_SECRET signature on the raw body. Public route —
// added to proxy.ts's skip list.
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  const syncSubscription = async (sub: Stripe.Subscription) => {
    const priceId = sub.items.data[0]?.price.id ?? null;
    const tier = priceId ? tierForPriceId(priceId) : null;
    const workspaceId =
      (sub.metadata?.workspace_id as string | undefined) ?? null;

    const patch: Record<string, unknown> = {
      stripe_subscription_id: sub.id,
      subscription_status: sub.status === "trialing" ? "trialing"
        : sub.status === "active" ? "active"
        : sub.status === "canceled" || sub.status === "unpaid" ? "canceled"
        : "past_due",
      trial_ends_at: sub.trial_end
        ? new Date(sub.trial_end * 1000).toISOString()
        : null,
    };
    if (tier) patch.subscription_tier = tier;

    if (workspaceId) {
      await admin.from("workspaces").update(patch).eq("id", workspaceId);
    } else {
      await admin
        .from("workspaces")
        .update(patch)
        .eq("stripe_customer_id", sub.customer as string);
    }
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const workspaceId = session.metadata?.workspace_id;
        if (workspaceId && session.customer) {
          await admin
            .from("workspaces")
            .update({ stripe_customer_id: session.customer as string })
            .eq("id", workspaceId);
        }
        // Subscription state itself syncs via customer.subscription.* events.
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
