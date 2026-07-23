import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Fair-use cap: trialing users get this many free invoices before the trial ends early and charges. */
export const TRIAL_FAIR_USE_INVOICE_CAP = 2;

/**
 * Prevents "load up the trial, cancel before day 7" abuse: once a trialing subscription's
 * business creates more than TRIAL_FAIR_USE_INVOICE_CAP invoices — through any path
 * (manual entry, CSV import, or email-forward ingestion) — end the Stripe trial immediately
 * (native trial_end: 'now') so the card on file is charged right away instead of waiting for
 * day 7. No-op for businesses without an active Stripe subscription, or once the subscription
 * is already active (not trialing). Call this BEFORE inserting the new invoice, so the count
 * passed in reflects invoices that already exist (i.e. pass the pre-insert count).
 */
export async function endTrialIfFairUseExceeded(
  supabase: SupabaseClient,
  business: { id: string; stripe_subscription_id: string | null }
) {
  if (!business.stripe_subscription_id) return;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return;

  const { count } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id);
  if ((count ?? 0) < TRIAL_FAIR_USE_INVOICE_CAP) return;

  try {
    const stripe = new Stripe(key);
    const sub = await stripe.subscriptions.retrieve(business.stripe_subscription_id);
    if (sub.status !== "trialing") return;
    await stripe.subscriptions.update(business.stripe_subscription_id, { trial_end: "now" });
    await supabase.from("events").insert({
      business_id: business.id,
      type: "trial_ended_fair_use",
      data: { invoice_count: count },
    });
  } catch {
    // billing hiccup shouldn't block invoice creation — Stripe will retry/dunning as usual
  }
}

/**
 * No-card free tier (`businesses.plan === "free"`): the first TRIAL_FAIR_USE_INVOICE_CAP
 * invoices for the business, by creation order, can arm normally (email only — see
 * lib/scheduler.ts). Everything after that still gets CREATED (so nothing is lost/hidden) but
 * can't be armed until the business adds a card — see the upgrade gate in app/actions/invoices.ts
 * and components/InvoiceActions.tsx.
 *
 * Derived entirely from real invoice rows, never a stored counter, so it can't drift — and can't
 * be reset by editing an invoice (business_id/created_at never change) or deleting one (there is
 * no delete-invoice path in this app).
 *
 * Pass no `beforeInvoiceCreatedAt` to ask "would a brand-new invoice be blocked right now"
 * (creation time — counts every existing invoice). Pass an existing invoice's own `created_at`
 * to ask "was THIS invoice within the free allowance" (used when arming/resuming later) — both
 * questions reduce to the same "how many invoices exist before this point" count.
 */
export async function isFreeTierInvoiceBlocked(
  supabase: SupabaseClient,
  business: { id: string; plan: string },
  beforeInvoiceCreatedAt?: string
): Promise<boolean> {
  if (business.plan !== "free") return false;
  let query = supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id);
  if (beforeInvoiceCreatedAt) query = query.lt("created_at", beforeInvoiceCreatedAt);
  const { count } = await query;
  return (count ?? 0) >= TRIAL_FAIR_USE_INVOICE_CAP;
}
