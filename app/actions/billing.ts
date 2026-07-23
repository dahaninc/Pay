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

const PRICE_ENV: Record<string, Record<"monthly" | "yearly", string | undefined>> = {
  solo: { monthly: process.env.STRIPE_PRICE_SOLO, yearly: process.env.STRIPE_PRICE_SOLO_YEARLY },
  crew: { monthly: process.env.STRIPE_PRICE_CREW, yearly: process.env.STRIPE_PRICE_CREW_YEARLY },
  pro: { monthly: process.env.STRIPE_PRICE_PRO, yearly: process.env.STRIPE_PRICE_PRO_YEARLY },
};

/** Subscription checkout (Stripe Billing). Pass trialDays to require a card up front
 *  but delay the first charge (Stripe-native trial — no custom charge scheduling). */
export async function startSubscription(formData: FormData) {
  const plan = String(formData.get("plan"));
  const interval = formData.get("interval") === "yearly" ? "yearly" : "monthly";
  const trialDays = Number(formData.get("trialDays")) || undefined;
  const successPath = String(formData.get("successPath") || "/settings?billing=success");
  const cancelPath = String(formData.get("cancelPath") || "/settings?billing=cancelled");
  const { supabase, business, user } = await requireBusiness();
  const stripe = stripeClient();
  if (!stripe)
    return { error: "Billing isn't configured yet — add STRIPE_SECRET_KEY and price IDs to enable subscriptions." };
  const price = PRICE_ENV[plan]?.[interval];
  if (!price) {
    const envName = `STRIPE_PRICE_${plan.toUpperCase()}${interval === "yearly" ? "_YEARLY" : ""}`;
    return { error: `No Stripe price configured for the ${plan} plan (${interval}) — set ${envName}.` };
  }

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
    metadata: { business_id: business.id, plan, interval },
    subscription_data: {
      metadata: { business_id: business.id, plan, interval },
      ...(trialDays ? { trial_period_days: trialDays } : {}),
    },
    success_url: `${appUrl()}${successPath}`,
    cancel_url: `${appUrl()}${cancelPath}`,
  });
  redirect(session.url!);
}

/** Stripe-hosted self-serve billing management (update card, view invoices, change plan). */
export async function openBillingPortal() {
  const { business } = await requireBusiness();
  const stripe = stripeClient();
  if (!stripe || !business.stripe_customer_id) {
    return { error: "No billing account yet." };
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: business.stripe_customer_id,
    return_url: `${appUrl()}/settings`,
  });
  redirect(session.url);
}

/**
 * Jumps straight into Stripe's native subscription-cancel confirmation — no extra steps,
 * no support email, no gate. Called from the "No thanks, cancel" button on the retention
 * screen (app/(app)/settings/cancel/page.tsx). One click in, one click through.
 */
export async function openCancelFlow() {
  const { business } = await requireBusiness();
  const stripe = stripeClient();
  if (!stripe || !business.stripe_customer_id || !business.stripe_subscription_id) {
    return { error: "No active subscription to cancel." };
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: business.stripe_customer_id,
    return_url: `${appUrl()}/settings`,
    flow_data: {
      type: "subscription_cancel",
      subscription_cancel: { subscription: business.stripe_subscription_id },
    },
  });
  redirect(session.url);
}

/** Stripe Connect (Standard) onboarding so customers can pay the business directly. */
export async function connectStripe() {
  const { supabase, business } = await requireBusiness();
  const stripe = stripeClient();
  if (!stripe)
    return { error: "Payments aren't configured yet — add STRIPE_SECRET_KEY to enable Pay Now links." };

  try {
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
  } catch (e) {
    // NEXT_REDIRECT throws by design — rethrow so the redirect above actually happens
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    return {
      error:
        e instanceof Error && e.message.includes("sign")
          ? "Stripe Connect isn't activated on this account yet — enable it at dashboard.stripe.com/connect, then try again."
          : `Couldn't connect Stripe: ${e instanceof Error ? e.message : "unknown error"}`,
    };
  }
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
