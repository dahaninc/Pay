import type { Business } from "@/lib/types";

export type BillingInterval = "monthly" | "yearly";

/** Yearly billing = 25% off the monthly rate, paid once a year. */
export const YEARLY_DISCOUNT_PCT = 25;

/** yearly = price * 12 * 0.75, rounded to the nearest dollar. */
export const PLANS = {
  solo: { name: "Solo", price: 29, yearly: 261, users: 1, invoicesPerMonth: 30, sms: 100, recommended: false },
  crew: { name: "Crew", price: 49, yearly: 441, users: 3, invoicesPerMonth: 100, sms: 300, recommended: true },
  pro: { name: "Pro", price: 99, yearly: 891, users: 10, invoicesPerMonth: Infinity, sms: 1000, recommended: false },
} as const;

export type PlanKey = keyof typeof PLANS;

/** Price for a plan at a given billing interval, in whole dollars. */
export function priceFor(planKey: PlanKey, interval: BillingInterval): number {
  return interval === "yearly" ? PLANS[planKey].yearly : PLANS[planKey].price;
}

/** What the yearly price works out to per month, for "$21.75/mo billed yearly" style copy. */
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
      return Infinity;
    case "trial":
      return PLANS.crew.invoicesPerMonth; // trial gets Crew-level limits
    case "expired":
      return 0;
  }
}

export function trialDaysLeft(business: Business): number {
  return Math.max(
    0,
    Math.ceil((new Date(business.trial_ends_at).getTime() - Date.now()) / 86400000)
  );
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
