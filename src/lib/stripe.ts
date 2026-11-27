import Stripe from "stripe";

// Lazy singleton — importing this module must not crash builds or tests
// where STRIPE_SECRET_KEY is unset (billing is a soft-enabled feature).
let stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripe) {
    stripe = new Stripe(key);
  }
  return stripe;
}
