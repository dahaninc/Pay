import Link from "next/link";
import { requireBusiness } from "@/lib/supabase/server";
import { updateBusiness } from "@/app/actions/business";
import { refreshStripeStatus } from "@/app/actions/billing";
import { signOut } from "@/app/actions/auth";
import { PlanPicker, ConnectStripeButton } from "@/components/BillingButtons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ChevronRightIcon, ClockIcon } from "@/components/icons";
import { trialDaysLeft } from "@/lib/plans";
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
          <div>
            <label className="label">Business phone</label>
            <input name="phone" type="tel" defaultValue={business.phone ?? ""} className="field" />
          </div>
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
            <p className="font-bold text-sm text-ink">
              Quiet hours: {business.quiet_start}:00am – {business.quiet_end - 12}:00pm · never
              Sundays
            </p>
          </div>
          <p className="text-[12.5px] font-medium text-muted mt-1.5 pl-7">
            Built-in and can&rsquo;t be loosened — keeps you compliant in every market.
          </p>
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
          <p className="bg-surface2 border border-hair rounded-xl px-3.5 py-3 font-disp font-bold text-sm text-accent-ink break-all select-all">
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
            {business.plan === "trial"
              ? `Free trial — ${trialDaysLeft(business)} days left`
              : business.plan === "expired"
                ? "Your trial has ended"
                : `You're on the ${business.plan} plan`}
          </p>
          <p className="text-[12.5px] font-medium text-muted mt-0.5">
            {business.plan === "trial" || business.plan === "expired"
              ? "Pick a plan below · cancel anytime"
              : "Manage or change your plan below"}
          </p>
        </div>
        <PlanPicker currentPlan={business.plan} />
      </div>

      <form action={signOut} className="pt-1 pb-3">
        <button type="submit" className="btn-danger w-full text-sm">
          Log out
        </button>
      </form>
    </div>
  );
}
