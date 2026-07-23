"use client";

import { useState, useTransition } from "react";
import { startSubscription, connectStripe, openBillingPortal, openCancelFlow } from "@/app/actions/billing";
import { PLANS, YEARLY_DISCOUNT_PCT, formatPlanPrice, yearlyMonthlyEquivalent, smsOverageRateDisplay, type BillingInterval } from "@/lib/plans";

export function ManageBillingButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        disabled={pending}
        className="btn-secondary !bg-surface2 text-sm"
        onClick={() =>
          startTransition(async () => {
            const result = await openBillingPortal();
            if (result?.error) setError(result.error);
          })
        }
      >
        Manage billing / cancel
      </button>
      {error && <p className="mt-2 text-xs text-muted">{error}</p>}
    </div>
  );
}

export function PlanPicker({ currentPlan }: { currentPlan: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  return (
    <div>
      <div className="flex items-center justify-center gap-3 mb-5">
        <div className="inline-flex bg-surface2 border border-hair rounded-full p-1">
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              interval === "monthly" ? "bg-surface text-ink shadow-sm" : "text-muted"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("yearly")}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              interval === "yearly" ? "bg-surface text-ink shadow-sm" : "text-muted"
            }`}
          >
            Yearly
          </button>
        </div>
        {interval === "yearly" && (
          <span className="text-xs font-bold text-win-ink bg-win-soft rounded-full px-2.5 py-1">
            Save {YEARLY_DISCOUNT_PCT}%
          </span>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((key) => {
          const plan = PLANS[key];
          const active = currentPlan === key;
          const price = formatPlanPrice(key, interval);
          return (
            <div
              key={key}
              className={`card p-4 relative ${active ? "ring-2 ring-brand-600" : ""} ${
                plan.recommended && !active ? "ring-2 ring-accent" : ""
              }`}
            >
              {plan.recommended && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[11px] font-bold bg-accent text-accent-ink rounded-full px-2.5 py-0.5">
                  Recommended
                </span>
              )}
              <p className="font-semibold">{plan.name}</p>
              <p className="text-2xl font-bold tnum">
                ${price}
                <span className="text-sm text-ink-400 font-normal">
                  {interval === "yearly" ? "/yr" : "/mo"}
                </span>
              </p>
              {interval === "yearly" && (
                <p className="text-xs text-ink-400 tnum">
                  (${yearlyMonthlyEquivalent(key).toFixed(2)}/mo billed yearly)
                </p>
              )}
              <p className="text-xs text-ink-600 mt-1">
                {plan.invoicesPerMonth.toLocaleString("en-US")} invoices/mo ·{" "}
                {plan.sms.toLocaleString("en-US")} SMS, then {smsOverageRateDisplay()}/SMS
              </p>
              {active ? (
                <p className="text-sm font-semibold text-brand-700 mt-3">Current plan ✓</p>
              ) : (
                <button
                  disabled={pending}
                  className="btn-secondary w-full !min-h-10 text-sm mt-3"
                  onClick={() =>
                    startTransition(async () => {
                      const fd = new FormData();
                      fd.set("plan", key);
                      fd.set("interval", interval);
                      const result = await startSubscription(fd);
                      if (result?.error) setError(result.error);
                    })
                  }
                >
                  Choose {plan.name}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-3 text-sm text-amber-800 bg-amber-50 rounded-lg p-3">{error}</p>}
    </div>
  );
}

/** The un-hidden "no thanks, cancel" action on the retention screen — one click straight
 *  into Stripe's own cancel confirmation, nothing gating it. */
export function CancelFlowButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        disabled={pending}
        className="text-sm font-semibold text-muted underline hover:text-ink"
        onClick={() =>
          startTransition(async () => {
            const result = await openCancelFlow();
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Opening…" : "No thanks, cancel my plan"}
      </button>
      {error && <p className="mt-2 text-xs text-muted">{error}</p>}
    </div>
  );
}

export function ConnectStripeButton({ connected, chargesEnabled }: { connected: boolean; chargesEnabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (connected && chargesEnabled)
    return (
      <p className="text-sm font-medium text-brand-700 bg-brand-50 rounded-lg p-3">
        ✓ Stripe connected — every reminder now carries a working Pay Now link.
      </p>
    );

  return (
    <div>
      <button
        disabled={pending}
        className="btn-primary"
        onClick={() =>
          startTransition(async () => {
            const result = await connectStripe();
            if (result?.error) setError(result.error);
          })
        }
      >
        {connected ? "Finish Stripe setup" : "Connect Stripe"}
      </button>
      {error && <p className="mt-3 text-sm text-amber-800 bg-amber-50 rounded-lg p-3">{error}</p>}
    </div>
  );
}
