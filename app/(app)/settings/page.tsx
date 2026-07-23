import Link from "next/link";
import { requireBusiness } from "@/lib/supabase/server";
import { updateBusiness } from "@/app/actions/business";
import { refreshStripeStatus } from "@/app/actions/billing";
import { signOut } from "@/app/actions/auth";
import { PlanPicker, ConnectStripeButton, ManageBillingButton } from "@/components/BillingButtons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AllowSundayToggle } from "@/components/AllowSundayToggle";
import { QuietHoursEditor } from "@/components/QuietHoursEditor";
import { RedeemCodeForm } from "@/components/RedeemCodeForm";
import { ChevronRightIcon, ClockIcon } from "@/components/icons";
import { trialDaysLeft, isStripeTrialing, stripeTrialDaysLeft, LTD_TIERS, LTD_MAX_STACK, APPSUMO_ENABLED } from "@/lib/plans";
import { CURRENCIES } from "@/lib/money";
import { BRAND, BRAND_TLD } from "@/lib/brand";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string; billing?: string }>;
}) {
  const sp = await searchParams;
  if (sp.stripe === "connected") await refreshStripeStatus();
  const { business } = await requireBusiness();

  return (
    <div className="max-w-[560px] mx-auto pt-3 space-y-4">
      <h1 className="sm:hidden font-disp font-extrabold text-[26px] tracking-[-0.02em] text-ink px-0.5 mb-1">
        Settings
      </h1>

      {sp.billing === "success" && (
        <div className="card p-4 bg-win-soft text-win-ink text-sm font-bold">
          🎉 Subscription active — thanks for going {BRAND}.
        </div>
      )}

      {/* appearance */}
      <div className="card px-4 py-1">
        <div className="flex items-center justify-between py-3.5">
          <div>
            <p className="font-bold text-[15px] text-ink">Dark mode</p>
            <p className="text-[12.5px] font-medium text-muted mt-0.5">
              Easier on the eyes at night.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* business profile */}
      <div>
        <p className="section-label px-1 mb-2.5">Business profile</p>
        <form action={updateBusiness} className="card p-4 flex flex-col gap-3.5">
          <div>
            <label className="label">Business name</label>
            <input name="name" defaultValue={business.name} required className="field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">From name</label>
              <input
                name="from_name"
                defaultValue={business.from_name ?? ""}
                className="field"
                placeholder={business.name}
              />
            </div>
            <div>
              <label className="label">Reply-to email</label>
              <input
                name="reply_to_email"
                type="email"
                defaultValue={business.reply_to_email ?? ""}
                className="field"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Business phone</label>
              <input name="phone" type="tel" defaultValue={business.phone || "+"} className="field" />
            </div>
            <div>
              <label className="label">Currency</label>
              <select name="currency" defaultValue={business.currency} className="field">
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11.5px] font-medium text-muted -mt-1">
            New invoices use this currency. Existing invoices keep the currency they were created
            with.
          </p>
          <button type="submit" className="btn-primary w-full">
            Save profile
          </button>
        </form>
      </div>

      {/* reminders */}
      <div>
        <p className="section-label px-1 mb-2.5">Reminders</p>
        <Link
          href="/settings/templates"
          className="card w-full p-4 flex items-center justify-between hover:bg-surface2 transition-colors mb-3"
          style={{ borderRadius: 16 }}
        >
          <span>
            <span className="block font-bold text-[15px] text-ink">
              Message templates &amp; tone
            </span>
            <span className="block text-[12.5px] font-medium text-muted mt-0.5 capitalize">
              Currently: {business.tone} · 5-step sequence
            </span>
          </span>
          <span className="text-muted">
            <ChevronRightIcon />
          </span>
        </Link>
        <div className="card p-4" style={{ borderRadius: 16 }}>
          <div className="flex items-center gap-2.5">
            <span className="text-win-ink">
              <ClockIcon />
            </span>
            <p className="font-bold text-sm text-ink">Quiet hours</p>
          </div>
          <p className="text-[12.5px] font-medium text-muted mt-1.5 pl-7 mb-3">
            8:00am–9:00pm is the suggested standard. Pick your own window anywhere within
            7:00am–10:00pm — that outer range can&rsquo;t be widened further, it&rsquo;s what
            keeps automated texts compliant in every market.
          </p>
          <div className="pl-7">
            <QuietHoursEditor
              initialStart={business.quiet_start}
              initialEnd={business.quiet_end}
              initialSendHour={business.preferred_send_hour}
            />
          </div>
          <div className="flex items-center justify-between mt-3.5 pt-3.5 border-t border-hair">
            <span>
              <span className="block text-sm font-bold text-ink">Allow Sunday sends</span>
              <span className="block text-[12.5px] font-medium text-muted mt-0.5 max-w-[380px]">
                Recommended off for most Western markets — but you know your customers. Turn on
                if Sunday is a normal business day where you operate (e.g. parts of Asia/Africa).
              </span>
            </span>
            <AllowSundayToggle initialValue={business.allow_sunday} />
          </div>
        </div>
      </div>

      {/* get paid */}
      <div id="payments">
        <p className="section-label px-1 mb-2.5">Get paid online</p>
        <div className="card p-4" style={{ borderRadius: 16 }}>
          <p className="text-[13.5px] font-medium text-muted mb-3.5">
            Connect Stripe and every reminder carries a Pay Now link. Money goes straight to your
            account — we never touch it.
          </p>
          <ConnectStripeButton
            connected={!!business.stripe_account_id}
            chargesEnabled={business.stripe_charges_enabled}
          />
        </div>
      </div>

      {/* invoice inbox */}
      <div>
        <p className="section-label px-1 mb-2.5">Your invoice inbox</p>
        <div className="card p-4" style={{ borderRadius: 16 }}>
          <p className="text-[13.5px] font-medium text-muted mb-3">
            Forward invoice emails here — {BRAND} reads them, you confirm 4 fields.
          </p>
          <p className="bg-surface2 border border-hair rounded-xl px-3.5 py-3 font-disp font-bold text-sm text-accent-text break-all select-all">
            bills+{business.inbound_alias}@{BRAND_TLD}
          </p>
        </div>
      </div>

      {/* billing */}
      <div id="billing">
        <p className="section-label px-1 mb-2.5">Plan &amp; billing</p>
        <div
          className="rounded-2xl border border-hair p-4 mb-3"
          style={{ background: "var(--accent-soft)" }}
        >
          <p className="font-bold text-[15px] text-ink">
            {business.plan === "lifetime"
              ? `Lifetime access — ${LTD_TIERS[Math.max(1, Math.min(business.lifetime_tier, LTD_MAX_STACK)) as 1 | 2 | 3].name}`
              : isStripeTrialing(business)
                ? `Free trial — ${stripeTrialDaysLeft(business)} days left`
                : business.plan === "trial"
                  ? `Free trial — ${trialDaysLeft(business)} days left`
                  : business.plan === "free"
                    ? "Free plan — no card yet"
                    : business.plan === "expired"
                      ? "Your trial has ended"
                      : `You're on the ${business.plan} plan`}
          </p>
          <p className="text-[12.5px] font-medium text-muted mt-0.5">
            {business.plan === "lifetime"
              ? APPSUMO_ENABLED
                ? "No subscription — stack another AppSumo code below to upgrade"
                : "Lifetime access — no subscription needed"
              : business.plan === "free"
                ? "Your first 2 invoices are free — pick a plan below anytime, or we'll ask when you create a 3rd"
                : isStripeTrialing(business) || business.plan === "trial" || business.plan === "expired"
                  ? "Pick a plan below · cancel anytime"
                  : "Manage or change your plan below"}
          </p>
        </div>
        {business.plan !== "lifetime" && <PlanPicker currentPlan={business.plan} />}
        {business.stripe_customer_id && (
          <div className="mt-3 flex items-center gap-4">
            <ManageBillingButton />
            {business.stripe_subscription_id && (
              <Link href="/settings/cancel" className="text-sm font-semibold text-muted underline hover:text-ink">
                Cancel plan
              </Link>
            )}
          </div>
        )}
        {APPSUMO_ENABLED && (
          <RedeemCodeForm lifetimeTier={business.lifetime_tier} maxStack={LTD_MAX_STACK} />
        )}
      </div>

      <form action={signOut} className="pt-1 pb-3">
        <button type="submit" className="btn-danger w-full text-sm">
          Log out
        </button>
      </form>
    </div>
  );
}
