import type { Business } from "@/lib/types";

export type BillingInterval = "monthly" | "yearly";

/** Yearly billing = ~25% off the monthly rate, paid once a year. */
export const YEARLY_DISCOUNT_PCT = 25;

/** yearly ≈ price * 12 * 0.75, priced down to a .99 ending. */
export const PLANS = {
  solo: { name: "Solo", price: 29, yearly: 259.99, users: 1, invoicesPerMonth: 30, sms: 100, recommended: false },
  crew: { name: "Crew", price: 49, yearly: 439.99, users: 3, invoicesPerMonth: 100, sms: 300, recommended: true },
  pro: { name: "Pro", price: 99, yearly: 889.99, users: 10, invoicesPerMonth: 1000, sms: 3000, recommended: false },
} as const;

export type PlanKey = keyof typeof PLANS;

/**
 * SMS beyond the plan's included pack bills as metered overage on the next Stripe invoice.
 * These numbers are CONTRACTUAL — they render on the pricing cards and onboarding, so any
 * change here changes what new signups agree to. International texts cost carriers 2–5× the
 * US rate; we rate them at the multiplier below, keyed off the CUSTOMER's number via
 * isDomesticSms() (same routing rule the sender uses — see lib/senders.ts).
 */
export const SMS_OVERAGE_US_CENTS = 5;
export const SMS_INTL_OVERAGE_MULTIPLIER = 3;

/** "$0.05" — the overage rate as display copy. Every user-facing mention must use this. */
export function smsOverageRateDisplay(): string {
  return `$${(SMS_OVERAGE_US_CENTS / 100).toFixed(2)}`;
}

/** Overage rate in cents for one SMS to the given destination. */
export function smsOverageRateCentsFor(domestic: boolean): number {
  return domestic ? SMS_OVERAGE_US_CENTS : SMS_OVERAGE_US_CENTS * SMS_INTL_OVERAGE_MULTIPLIER;
}

/** SMS included in the plan's monthly pack before overage billing kicks in. */
export function includedSmsFor(business: Business): number {
  switch (business.plan) {
    case "solo":
    case "crew":
    case "pro":
      return PLANS[business.plan].sms;
    case "trial":
      return PLANS.crew.sms; // trial gets Crew-level limits, same as invoiceLimitFor
    case "free":
      return 0; // no-card free tier is email-only — SMS never sends (see lib/scheduler.ts)
    case "expired":
      return 0;
    case "lifetime":
      return LTD_TIERS[Math.max(1, Math.min(business.lifetime_tier, LTD_MAX_STACK)) as 1 | 2 | 3].sms;
  }
}

/**
 * AppSumo launch switch: we haven't registered with AppSumo yet, so the redemption UI
 * (Settings → "Have an AppSumo code?") and the redeem server action are both gated off
 * until this flips to true. Everything underneath (schema, tiers, CLI scripts, admin
 * views, any existing lifetime businesses) stays fully functional — this only stops
 * NEW redemptions and hides the box from customers.
 */
export const APPSUMO_ENABLED = false;

/**
 * AppSumo-style lifetime-deal tiers. Codes stack: redeeming N codes reaches tier N
 * (capped at LTD_MAX_STACK). ⚠️ Placeholder limits — tune to match the real AppSumo
 * listing copy before launch; these are not derived from any pricing decision.
 */
export const LTD_TIERS = {
  1: { name: "LTD Tier 1", invoicesPerMonth: 40, sms: 150, users: 2 },
  2: { name: "LTD Tier 2", invoicesPerMonth: 120, sms: 400, users: 5 },
  3: { name: "LTD Tier 3", invoicesPerMonth: Infinity, sms: 1000, users: 15 },
} as const;
export const LTD_MAX_STACK = 3;

/** Price for a plan at a given billing interval. */
export function priceFor(planKey: PlanKey, interval: BillingInterval): number {
  return interval === "yearly" ? PLANS[planKey].yearly : PLANS[planKey].price;
}

/** Display string for a price: whole dollars for monthly, always 2 decimals for yearly (.99 pricing). */
export function formatPlanPrice(planKey: PlanKey, interval: BillingInterval): string {
  const price = priceFor(planKey, interval);
  return interval === "yearly" ? price.toFixed(2) : String(price);
}

/** What the yearly price works out to per month, for "$21.67/mo billed yearly" style copy. */
export function yearlyMonthlyEquivalent(planKey: PlanKey): number {
  return Math.round((PLANS[planKey].yearly / 12) * 100) / 100;
}

export function invoiceLimitFor(business: Business): number {
  switch (business.plan) {
    case "solo":
      return PLANS.solo.invoicesPerMonth;
    case "crew":
      return PLANS.crew.invoicesPerMonth;
    case "pro":
      return PLANS.pro.invoicesPerMonth;
    case "trial":
      return PLANS.crew.invoicesPerMonth; // trial gets Crew-level limits
    case "free":
      // no monthly quota here — the no-card free tier's real cap (first 2 invoices ever, by
      // creation order) is enforced separately in lib/trial.ts (isFreeTierInvoiceBlocked),
      // since it must never reset month to month the way this per-plan quota does.
      return Infinity;
    case "expired":
      return 0;
    case "lifetime":
      return LTD_TIERS[Math.max(1, Math.min(business.lifetime_tier, LTD_MAX_STACK)) as 1 | 2 | 3]
        .invoicesPerMonth;
  }
}

export function trialDaysLeft(business: Business): number {
  return Math.max(
    0,
    Math.ceil((new Date(business.trial_ends_at).getTime() - Date.now()) / 86400000)
  );
}

/** True when Stripe reports this business's card-required trial as still running (independent of `plan`, which holds the target plan name during a Stripe trial, not "trial"). */
export function isStripeTrialing(business: Business): boolean {
  return business.stripe_subscription_status === "trialing" && !!business.stripe_trial_end;
}

export function stripeTrialDaysLeft(business: Business): number {
  if (!business.stripe_trial_end) return 0;
  return Math.max(0, Math.ceil((new Date(business.stripe_trial_end).getTime() - Date.now()) / 86400000));
}

export function isTrialExpired(business: Business): boolean {
  return business.plan === "trial" && new Date(business.trial_ends_at) < new Date();
}

/** Businesses that can send reminders: paying, or in an active trial. */
export function canSend(business: Business): boolean {
  if (business.plan === "expired") return false;
  if (business.plan === "trial") return !isTrialExpired(business);
  return true;
}
