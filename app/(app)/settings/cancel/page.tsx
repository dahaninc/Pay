import Link from "next/link";
import { requireBusiness } from "@/lib/supabase/server";
import { CancelFlowButton } from "@/components/BillingButtons";
import { PLANS } from "@/lib/plans";
import { BRAND } from "@/lib/brand";

/**
 * Retention interstitial shown before Stripe's cancel flow opens. Compliant by design:
 * "No thanks, cancel" is a real, un-hidden, one-click action (CancelFlowButton) — this
 * screen slows impulsive churn, it never gates or hides the exit.
 */
export default async function CancelPage() {
  const { business } = await requireBusiness();
  const plan = business.plan in PLANS ? PLANS[business.plan as keyof typeof PLANS] : null;

  return (
    <div className="max-w-[520px] mx-auto pt-3">
      <div className="card p-6 sm:p-8">
        <h1 className="font-disp font-extrabold text-xl text-ink">
          Wait — here&rsquo;s what you&rsquo;ll lose
        </h1>
        <p className="text-sm font-medium text-muted mt-1.5">
          Cancelling stops {BRAND} immediately. Here&rsquo;s what stops with it:
        </p>

        <ul className="space-y-2.5 mt-5 mb-6">
          <li className="text-sm font-medium text-ink flex gap-2">
            <span className="text-danger-ink">✕</span>
            All reminder sequences stop — any unpaid invoices go back to you chasing them
            manually.
          </li>
          <li className="text-sm font-medium text-ink flex gap-2">
            <span className="text-danger-ink">✕</span>
            {plan ? `Your ${plan.name} plan's ${plan.sms} SMS/mo and ${plan.invoicesPerMonth === Infinity ? "unlimited" : plan.invoicesPerMonth} invoice slots` : "Your current plan's limits"} go away.
          </li>
          <li className="text-sm font-medium text-ink flex gap-2">
            <span className="text-danger-ink">✕</span>
            Your Pay Now links keep working for invoices already sent, but no new reminders
            will go out for them.
          </li>
        </ul>

        <Link href="/settings" className="btn-primary w-full !font-extrabold text-center block">
          Keep my plan
        </Link>

        <div className="mt-5 text-center">
          <CancelFlowButton />
        </div>
      </div>
    </div>
  );
}
