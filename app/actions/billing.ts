"use server";

import { redirect } from "next/navigation";
import Stripe from "stripe";
import { requireBusiness } from "@/lib/supabase/server";
import { appUrl } from "@/lib/scheduler";

function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

const PRICE_ENV: Record<string, string | undefined> = {
  solo: process.env.STRIPE_PRICE_SOLO,
  crew: process.env.STRIPE_PRICE_CREW,
  pro: process.env.STRIPE_PRICE_PRO,
};

/** Subscription checkout (Stripe Billing). */
export async function startSubscription(formData: FormData) {
  const plan = String(formData.get("plan"));
  const { supabase, business, user } = await requireBusiness();
  const stripe = stripeClient();
  if (!stripe)
    return { error: "Billing isn't configured yet — add STRIPE_SECRET_KEY and price IDs to enable subscriptions." };
  const price = PRICE_ENV[plan];
  if (!price)
    return { error: `No Stripe price configured for the ${plan} plan (STRIPE_PRICE_${plan.toUpperCase()}).` };

  let customerId = business.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: business.name,
      metadata: { business_id: business.id },
    });
    customerId = customer.id;
    await supabase
      .from("businesses")
      .update({ stripe_customer_id: customerId })
      .eq("id", business.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    metadata: { business_id: business.id, plan },
    subscription_data: { metadata: { business_id: business.id, plan } },
    success_url: `${appUrl()}/settings?billing=success`,
    cancel_url: `${appUrl()}/settings?billing=cancelled`,
  });
  redirect(session.url!);
}

/** Stripe Connect (Standard) onboarding so customers can pay the business directly. */
export async function connectStripe() {
  const { supabase, business } = await requireBusiness();
  const stripe = stripeClient();
  if (!stripe)
    return { error: "Payments aren't configured yet — add STRIPE_SECRET_KEY to enable Pay Now links." };

  let accountId = business.stripe_account_id;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "standard",
      metadata: { business_id: business.id },
    });
    accountId = account.id;
    await supabase
      .from("businesses")
      .update({ stripe_account_id: accountId })
      .eq("id", business.id);
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${appUrl()}/settings?stripe=refresh`,
    return_url: `${appUrl()}/settings?stripe=connected`,
  });
  redirect(link.url);
}

/** Refresh charges_enabled after onboarding returns. */
export async function refreshStripeStatus() {
  const { supabase, business } = await requireBusiness();
  const stripe = stripeClient();
  if (!stripe || !business.stripe_account_id) return { ok: false };
  const account = await stripe.accounts.retrieve(business.stripe_account_id);
  await supabase
    .from("businesses")
    .update({ stripe_charges_enabled: !!account.charges_enabled })
    .eq("id", business.id);
  return { ok: true, chargesEnabled: !!account.charges_enabled };
}
