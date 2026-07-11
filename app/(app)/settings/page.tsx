import Link from "next/link";
import { requireBusiness } from "@/lib/supabase/server";
import { updateBusiness } from "@/app/actions/business";
import { refreshStripeStatus } from "@/app/actions/billing";
import { signOut } from "@/app/actions/auth";
import { PlanPicker, ConnectStripeButton } from "@/components/BillingButtons";
import { trialDaysLeft } from "@/lib/plans";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string; billing?: string }>;
}) {
  const sp = await searchParams;
  if (sp.stripe === "connected") await refreshStripeStatus();
  const { business } = await requireBusiness();

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {sp.billing === "success" && (
        <div className="card p-4 bg-brand-50 border-brand-100 text-brand-700 text-sm">
          🎉 Subscription active — thanks for going PaidUp.
        </div>
      )}

      {/* business profile */}
      <section className="card p-5 sm:p-6">
        <h2 className="font-bold mb-4">Business profile</h2>
        <form action={updateBusiness} className="space-y-4">
          <div>
            <label className="label">Business name</label>
            <input name="name" defaultValue={business.name} required className="field" />
          </div>
          <div>
            <label className="label">Sender name on reminders</label>
            <input
              name="from_name"
              defaultValue={business.from_name ?? ""}
              className="field"
              placeholder={business.name}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Reply-to email</label>
              <input
                name="reply_to_email"
                type="email"
                defaultValue={business.reply_to_email ?? ""}
                className="field"
              />
            </div>
            <div>
              <label className="label">Business phone</label>
              <input name="phone" type="tel" defaultValue={business.phone ?? ""} className="field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Quiet hours start</label>
              <select name="quiet_start" defaultValue={business.quiet_start} className="field">
                {[8, 9, 10, 11].map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Quiet hours end</label>
              <select name="quiet_end" defaultValue={business.quiet_end} className="field">
                {[17, 18, 19, 20].map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-ink-400">
            Reminders only send inside these hours, never on Sundays. That&rsquo;s a hard rule —
            it keeps you compliant and your customers happy.
          </p>
          <button type="submit" className="btn-primary w-full">
            Save profile
          </button>
        </form>
      </section>

      {/* tone + templates */}
      <section className="card p-5 sm:p-6">
        <h2 className="font-bold mb-1">Reminder messages</h2>
        <p className="text-sm text-ink-600 mb-4">
          Tone: <span className="font-semibold capitalize">{business.tone}</span> · 5-step
          sequence
        </p>
        <Link href="/settings/templates" className="btn-secondary w-full">
          Edit tone &amp; message templates
        </Link>
      </section>

      {/* get paid */}
      <section className="card p-5 sm:p-6" id="payments">
        <h2 className="font-bold mb-1">Get paid online</h2>
        <p className="text-sm text-ink-600 mb-4">
          Connect Stripe and every reminder carries a Pay Now link. Money goes straight to your
          account — we never touch it.
        </p>
        <ConnectStripeButton
          connected={!!business.stripe_account_id}
          chargesEnabled={business.stripe_charges_enabled}
        />
      </section>

      {/* email-in address */}
      <section className="card p-5 sm:p-6">
        <h2 className="font-bold mb-1">Your invoice inbox</h2>
        <p className="text-sm text-ink-600 mb-3">
          Forward invoice emails here and PaidUp reads them for you — you just confirm 4 fields.
        </p>
        <p className="font-mono text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 select-all">
          bills+{business.inbound_alias}@paidup.app
        </p>
      </section>

      {/* billing */}
      <section id="billing">
        <h2 className="font-bold mb-1">Billing</h2>
        <p className="text-sm text-ink-600 mb-4">
          {business.plan === "trial"
            ? `Free trial — ${trialDaysLeft(business)} days left. Pick a plan any time.`
            : business.plan === "expired"
              ? "Your trial has ended. Pick a plan to resume reminders."
              : `You're on the ${business.plan} plan.`}
        </p>
        <PlanPicker currentPlan={business.plan} />
      </section>

      <form action={signOut} className="text-center pb-4">
        <button type="submit" className="text-sm text-ink-400 underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
