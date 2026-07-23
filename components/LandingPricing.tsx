"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon } from "@/components/icons";
import { PLANS, YEARLY_DISCOUNT_PCT, formatPlanPrice, yearlyMonthlyEquivalent, smsOverageRateDisplay, type BillingInterval } from "@/lib/plans";

// tags from the approved homepage prototype
const BLURBS: Record<keyof typeof PLANS, string> = {
  solo: "For one-person operations",
  crew: "For growing teams",
  pro: "For AR desks at scale",
};

export function LandingPricing() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  return (
    <section id="pricing" className="pt-[88px] scroll-mt-16">
      <h2 className="font-disp font-extrabold text-[clamp(26px,3.6vw,38px)] text-ink text-center">
        Simple, honest pricing
      </h2>
      <p className="text-sm font-medium text-muted text-center mt-2.5">
        Start with 2 free invoices — no card. Upgrade when it&rsquo;s paying for itself.{" "}
        <span className="text-muted opacity-70">(We only ask for a card on your 3rd invoice.)</span>
      </p>

      <div className="flex items-center justify-center gap-3 mt-7">
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
        className="grid gap-4 mt-[26px]"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}
      >
        {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((key) => {
          const plan = PLANS[key];
          const price = formatPlanPrice(key, interval);
          // Crew is the prototype's featured dark card; Solo/Pro stay light
          const dark = plan.recommended;
          const features = [
            `${plan.invoicesPerMonth.toLocaleString("en-US")} active invoices / mo`,
            `${plan.sms.toLocaleString("en-US")} SMS included, then ${smsOverageRateDisplay()}/SMS`,
            `${plan.users} ${plan.users === 1 ? "user" : "users"}${key === "pro" ? " · priority support + API" : ""}`,
          ];
          return (
            <div
              key={key}
              className="rounded-[18px] p-6 flex flex-col relative"
              style={
                dark
                  ? { background: "var(--ink)", border: "1px solid var(--ink)", color: "#fff" }
                  : { background: "var(--surface)", border: "1px solid var(--hair)" }
              }
            >
              {dark && (
                <span className="self-start px-2.5 py-1 rounded-full bg-accent text-accent-ink text-[11px] font-extrabold tracking-[0.04em] mb-3">
                  POPULAR
                </span>
              )}
              <p className={`font-bold text-[13px] uppercase tracking-[0.06em] ${dark ? "text-white/70" : "text-muted"}`}>
                {plan.name}
              </p>
              <p className="mt-2.5 mb-0.5">
                <span className={`font-disp font-extrabold text-[38px] tnum ${dark ? "text-white" : "text-ink"}`}>
                  ${price}
                </span>
                <span className={`font-semibold ${dark ? "text-white/60" : "text-muted"}`}>
                  {interval === "yearly" ? "/yr" : "/mo"}
                </span>
              </p>
              {interval === "yearly" && (
                <p className={`text-xs tnum mb-1 ${dark ? "text-white/60" : "text-muted"}`}>
                  (${yearlyMonthlyEquivalent(key).toFixed(2)}/mo billed yearly)
                </p>
              )}
              <p className={`text-[13px] font-medium ${dark ? "text-white/70" : "text-muted"}`}>
                {BLURBS[key]}
              </p>
              <div className="flex flex-col gap-2 my-4 mb-[18px]">
                {features.map((f) => (
                  <span
                    key={f}
                    className={`flex items-center gap-2 text-[13.5px] font-medium ${dark ? "text-white/80" : "text-muted"}`}
                  >
                    <span className="text-win">
                      <CheckIcon size={15} strokeWidth={3} />
                    </span>
                    {f}
                  </span>
                ))}
              </div>
              <Link
                href={`/login?plan=${key}&interval=${interval}`}
                className={`${dark ? "btn-primary" : "btn-secondary !bg-surface2"} mt-auto text-sm`}
              >
                Choose {plan.name}
              </Link>
              <p className={`text-[11px] font-medium mt-2.5 text-center ${dark ? "text-white/60" : "text-muted"}`}>
                Free for your first 2 invoices, then ${price}
                {interval === "yearly" ? "/yr" : "/mo"} when you create a 3rd.
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] font-medium text-muted text-center opacity-70 mt-5 max-w-[52ch] mx-auto">
        No card required to sign up. Your first 2 invoices are completely free — full email
        reminders included. Creating a 3rd invoice adds a card and starts the plan you picked
        (or switch anytime in Settings). SMS beyond your included pack bills at{" "}
        {smsOverageRateDisplay()}/text for US &amp; Canada numbers (international texts are
        rated higher to cover carrier costs), added to your next invoice.
      </p>
    </section>
  );
}
