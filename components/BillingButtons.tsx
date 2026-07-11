"use client";

import { useState, useTransition } from "react";
import { startSubscription, connectStripe } from "@/app/actions/billing";
import { PLANS } from "@/lib/plans";

export function PlanPicker({ currentPlan }: { currentPlan: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <div className="grid sm:grid-cols-3 gap-3">
        {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((key) => {
          const plan = PLANS[key];
          const active = currentPlan === key;
          return (
            <div key={key} className={`card p-4 ${active ? "ring-2 ring-brand-600" : ""}`}>
              <p className="font-semibold">{plan.name}</p>
              <p className="text-2xl font-bold tnum">
                ${plan.price}
                <span className="text-sm text-ink-400 font-normal">/mo</span>
              </p>
              <p className="text-xs text-ink-600 mt-1">
                {plan.invoicesPerMonth === Infinity
                  ? "Unlimited invoices"
                  : `${plan.invoicesPerMonth} invoices/mo`}{" "}
                · {plan.sms} SMS
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
