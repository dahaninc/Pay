import type { Business } from "@/lib/types";

export type BillingInterval = "monthly" | "yearly";

/** Yearly billing = ~25% off the monthly rate, paid once a year. */
export const YEARLY_DISCOUNT_PCT = 25;

/** yearly ≈ price * 12 * 0.75, priced down to a .99 ending. */
export const PLANS = {
  solo: { name: "Solo", price: 29, yearly: 259.99, users: 1, invoicesPerMonth: 30, sms: 100, recommended: false },
  crew: { name: "Crew", price: 49, yearly: 439.99, users: 3, invoicesPerMonth: 100, sms: 300, recommended: true },
  pro: { name: "Pro", price: 99, yearly: 889.99, users: 10, invoicesPerMonth: Infinity, sms: 1000, recommended: false },
} as const;

export type PlanKey = keyof typeof PLANS;

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
