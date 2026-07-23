"use server";

import { revalidatePath } from "next/cache";
import Stripe from "stripe";
import { createServerSupabase, createAdminSupabase, isAdminUser } from "@/lib/supabase/server";
import { PLANS, LTD_MAX_STACK, type PlanKey, type BillingInterval } from "@/lib/plans";
import type { Business } from "@/lib/types";

const PRICE_ENV: Record<PlanKey, Record<BillingInterval, string | undefined>> = {
  solo: { monthly: process.env.STRIPE_PRICE_SOLO, yearly: process.env.STRIPE_PRICE_SOLO_YEARLY },
  crew: { monthly: process.env.STRIPE_PRICE_CREW, yearly: process.env.STRIPE_PRICE_CREW_YEARLY },
  pro: { monthly: process.env.STRIPE_PRICE_PRO, yearly: process.env.STRIPE_PRICE_PRO_YEARLY },
};

/**
 * Admin gate for these server actions. Server actions are network-callable POST endpoints,
 * so EVERY action here re-verifies the session against admin_users — never trust the caller.
 * Returns the admin's email (for the audit trail) or null.
 */
async function requireAdminAction(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  return (await isAdminUser(user.email)) ? user.email : null;
}

async function getBusiness(businessId: string): Promise<Business | null> {
  const admin = createAdminSupabase();
  if (!admin) return null;
  const { data } = await admin.from("businesses").select("*").eq("id", businessId).single();
  return (data as Business) ?? null;
}

async function audit(businessId: string, adminEmail: string, action: string, detail: Record<string, unknown>) {
  const admin = createAdminSupabase();
  if (!admin) return;
  await admin.from("events").insert({
    business_id: businessId,
    type: "admin_subscription_change",
    data: { action, admin: adminEmail, ...detail },
  });
}

/**
 * Change a business's plan. With a Stripe subscription: swaps the subscription's price
 * (prorated) — real billing change. Without one (cardless trial / expired): sets the local
 * plan directly, which grants access without charging — the UI says so explicitly.
 */
export async function adminChangePlan(formData: FormData) {
  const adminEmail = await requireAdminAction();
  if (!adminEmail) return { error: "Not authorized" };

  const businessId = String(formData.get("business_id"));
  const planKey = String(formData.get("plan")) as PlanKey;
  const interval = (formData.get("interval") === "yearly" ? "yearly" : "monthly") as BillingInterval;
  if (!(planKey in PLANS)) return { error: "Unknown plan" };

  const business = await getBusiness(businessId);
  if (!business) return { error: "Business not found" };
  const admin = createAdminSupabase();
  if (!admin) return { error: "Service unavailable" };

  try {
    if (business.stripe_subscription_id) {
      const key = process.env.STRIPE_SECRET_KEY;
      const priceId = PRICE_ENV[planKey]?.[interval];
      if (!key) return { error: "Stripe isn't configured" };
      if (!priceId) return { error: `No Stripe price configured for ${planKey}/${interval}` };

      const stripe = new Stripe(key);
      const sub = await stripe.subscriptions.retrieve(business.stripe_subscription_id);
      const itemId = sub.items.data[0]?.id;
      if (!itemId) return { error: "Subscription has no items — check it in Stripe directly" };

      await stripe.subscriptions.update(business.stripe_subscription_id, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "create_prorations",
        metadata: { ...sub.metadata, plan: planKey, interval },
      });
      // local cache updates via the customer.subscription.updated webhook; set plan now
      // anyway so the admin sees the change immediately even if the webhook lags
      await admin.from("businesses").update({ plan: planKey }).eq("id", businessId);
      await audit(businessId, adminEmail, "change_plan_stripe", {
        from: business.plan,
        to: planKey,
        interval,
      });
    } else {
      await admin.from("businesses").update({ plan: planKey, lifetime_tier: 0 }).eq("id", businessId);
      await audit(businessId, adminEmail, "change_plan_local_comp", {
        from: business.plan,
        to: planKey,
        note: "no Stripe subscription — access granted without billing",
      });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Stripe update failed" };
  }

  revalidatePath(`/admin/users/${businessId}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Give a business free access until a date. With a Stripe subscription this sets trial_end —
 * Stripe's supported way to pause charging until a future date (the subscription shows as
 * "trialing" until then, and normal billing resumes automatically after). Without a Stripe
 * subscription it extends the local cardless trial.
 */
export async function adminSetAccessUntil(formData: FormData) {
  const adminEmail = await requireAdminAction();
  if (!adminEmail) return { error: "Not authorized" };

  const businessId = String(formData.get("business_id"));
  const dateStr = String(formData.get("access_until") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { error: "Pick a date" };
  const until = new Date(`${dateStr}T23:59:59Z`);
  const now = new Date();
  if (until <= now) return { error: "Date must be in the future" };
  if (until.getTime() - now.getTime() > 2 * 365 * 86400000)
    return { error: "That's more than 2 years out — double-check the date" };

  const business = await getBusiness(businessId);
  if (!business) return { error: "Business not found" };
  const admin = createAdminSupabase();
  if (!admin) return { error: "Service unavailable" };

  try {
    if (business.stripe_subscription_id) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) return { error: "Stripe isn't configured" };
      const stripe = new Stripe(key);
      await stripe.subscriptions.update(business.stripe_subscription_id, {
        trial_end: Math.floor(until.getTime() / 1000),
        proration_behavior: "none",
      });
      // stripe_subscription_status/stripe_trial_end cache updates via webhook
      await audit(businessId, adminEmail, "set_access_until_stripe", {
        until: until.toISOString(),
      });
    } else {
      await admin
        .from("businesses")
        .update({ plan: "trial", trial_ends_at: until.toISOString() })
        .eq("id", businessId);
      await audit(businessId, adminEmail, "set_access_until_local", {
        until: until.toISOString(),
      });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Stripe update failed" };
  }

  revalidatePath(`/admin/users/${businessId}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Set an AppSumo lifetime tier directly (0 = revoke lifetime access → expired). */
export async function adminSetLifetimeTier(formData: FormData) {
  const adminEmail = await requireAdminAction();
  if (!adminEmail) return { error: "Not authorized" };

  const businessId = String(formData.get("business_id"));
  const tier = parseInt(String(formData.get("tier")), 10);
  if (!Number.isInteger(tier) || tier < 0 || tier > LTD_MAX_STACK) return { error: "Invalid tier" };

  const business = await getBusiness(businessId);
  if (!business) return { error: "Business not found" };
  const admin = createAdminSupabase();
  if (!admin) return { error: "Service unavailable" };

  await admin
    .from("businesses")
    .update({ lifetime_tier: tier, plan: tier === 0 ? "expired" : "lifetime" })
    .eq("id", businessId);
  await audit(businessId, adminEmail, "set_lifetime_tier", {
    from: business.lifetime_tier,
    to: tier,
  });

  revalidatePath(`/admin/users/${businessId}`);
  revalidatePath("/admin/users");
  return { ok: true };
}
