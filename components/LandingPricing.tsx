"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon } from "@/components/icons";
import { PLANS, YEARLY_DISCOUNT_PCT, formatPlanPrice, yearlyMonthlyEquivalent, type BillingInterval } from "@/lib/plans";

const BLURBS: Record<keyof typeof PLANS, string> = {
  solo: "For one-person outfits",
  crew: "For small crews",
  pro: "For established firms",
};

export function LandingPricing() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  return (
    <section className="mt-12">
      <h2 className="font-disp font-extrabold text-[22px] text-ink text-center">Simple pricing</h2>
      <p className="text-sm font-medium text-muted text-center mt-1.5">
        Every plan starts with 14 days free. No card up front.
      </p>

      <div className="flex items-center justify-center gap-3 mt-6">
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

      <div
        className="grid gap-4 mt-[22px]"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}
      >
        {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((key) => {
          const plan = PLANS[key];
          const price = formatPlanPrice(key, interval);
          const features = [
            plan.invoicesPerMonth === Infinity
              ? "Unlimited invoices"
              : `${plan.invoicesPerMonth} active invoices / mo`,
            `${plan.sms} SMS included`,
            `${plan.users} ${plan.users === 1 ? "user" : "users"}${key === "pro" ? " · priority support + API" : ""}`,
          ];
          return (
            <div
              key={key}
              className="bg-surface rounded-[18px] p-5 flex flex-col relative"
              style={{ border: plan.recommended ? "2px solid var(--accent)" : "1px solid var(--hair)" }}
            >
              {plan.recommended && (
                <span className="self-start px-2.5 py-1 rounded-full bg-accent text-accent-ink text-[11px] font-extrabold mb-2.5">
                  Recommended
                </span>
              )}
              <p className="font-bold text-[17px] text-ink">{plan.name}</p>
              <p className="text-[13px] font-medium text-muted">{BLURBS[key]}</p>
              <p className="mt-3.5 mb-0.5">
                <span className="font-disp font-extrabold text-[38px] text-ink tnum">${price}</span>
                <span className="text-muted font-semibold">{interval === "yearly" ? "/yr" : "/mo"}</span>
              </p>
              {interval === "yearly" && (
                <p className="text-xs text-muted tnum mb-1">
                  (${yearlyMonthlyEquivalent(key).toFixed(2)}/mo billed yearly)
                </p>
              )}
              <div className="flex flex-col gap-2 my-3.5 mb-[18px]">
                {features.map((f) => (
                  <span key={f} className="flex items-center gap-2 text-[13.5px] font-medium text-muted">
                    <span className="text-win">
                      <CheckIcon size={15} strokeWidth={3} />
                    </span>
                    {f}
                  </span>
                ))}
              </div>
              <Link
                href="/login"
                className={`${plan.recommended ? "btn-primary" : "btn-secondary !bg-surface2"} mt-auto text-sm`}
              >
                Start free trial
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
