import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { getAppOrigin } from "@/lib/app-url";

// POST → { url } Stripe Customer Portal session (update card, cancel,
// view invoices). Requires the workspace to already have a customer.
export async function POST() {
  const user = await requireRole("admin");
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .select("stripe_customer_id")
    .eq("id", user.workspace_id)
    .single();
  if (!ws?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account yet" }, { status: 400 });
  }

  const origin = await getAppOrigin();
  const session = await stripe.billingPortal.sessions.create({
    customer: ws.stripe_customer_id,
    return_url: `${origin}/admin/workspace?tab=billing`,
  });
  return NextResponse.json({ url: session.url });
}
