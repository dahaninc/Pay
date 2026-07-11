import type { Business } from "@/lib/types";

export const PLANS = {
  solo: { name: "Solo", price: 29, yearly: 290, users: 1, invoicesPerMonth: 30, sms: 100 },
  crew: { name: "Crew", price: 49, yearly: 490, users: 3, invoicesPerMonth: 100, sms: 300 },
  pro: { name: "Pro", price: 99, yearly: 990, users: 10, invoicesPerMonth: Infinity, sms: 1000 },
} as const;

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
