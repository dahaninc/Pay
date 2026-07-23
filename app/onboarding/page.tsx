import { redirect } from "next/navigation";
import { createServerSupabase, isAdminUser } from "@/lib/supabase/server";
import { createBusiness } from "@/app/actions/business";
import { Logo } from "@/components/Logo";
import { TimezoneField } from "@/components/TimezoneField";
import { CURRENCIES } from "@/lib/money";
import { PLANS, formatPlanPrice, smsOverageRateDisplay, type BillingInterval } from "@/lib/plans";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const params = await searchParams;
  const planKey = params.plan && params.plan in PLANS ? (params.plan as keyof typeof PLANS) : "crew";
  const interval: BillingInterval = params.interval === "yearly" ? "yearly" : "monthly";

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1);
  if (existing?.length) redirect("/invoices");

  // Platform staff (CEO etc.) land here after their first login like any new user would —
  // but they aren't customers. Route them to the admin dashboard instead of client signup,
  // where submitting this form would start a real Stripe trial.
  if (await isAdminUser(user.email)) redirect("/admin");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-bg py-10">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="card w-full max-w-md p-7">
        <h1 className="font-disp font-extrabold text-xl text-ink">Set up your business</h1>
        <p className="text-muted text-sm mt-1 mb-6">
          Takes 30 seconds. You can change everything later.
        </p>
        <form action={createBusiness} className="space-y-5">
          <input type="hidden" name="plan" value={planKey} />
          <input type="hidden" name="interval" value={interval} />
          <div>
            <label className="label" htmlFor="name">
              Business name
            </label>
            <input
              id="name"
              name="name"
              required
              className="field"
              placeholder="Dave's Plumbing"
              autoFocus
            />
            <p className="text-xs text-muted mt-1.5">
              This is the name your customers see on reminders.
            </p>
          </div>
          <TimezoneField />
          <div>
            <label className="label" htmlFor="currency">
              Currency
            </label>
            <select id="currency" name="currency" className="field" defaultValue="USD">
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="tone">
              How should reminders sound?
            </label>
            <select id="tone" name="tone" className="field" defaultValue="professional">
              <option value="friendly">Friendly — &ldquo;Hi Sarah! Quick note…&rdquo;</option>
              <option value="professional">Professional — polite and direct</option>
              <option value="firm">Firm — for the slow payers</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="phone">
              Your mobile <span className="text-muted font-normal">(optional)</span>
            </label>
            <input id="phone" name="phone" type="tel" className="field" placeholder="+1 555 000 1234" defaultValue="+" />
          </div>
          <button type="submit" className="btn-primary w-full !font-extrabold">
            Create my business — no card →
          </button>
          <p className="text-xs font-medium text-muted text-center mt-2">
            Your first 2 invoices are free, no card required — full email reminders included.
            Creating a 3rd invoice will ask for a card to start the {PLANS[planKey].name} plan
            (${formatPlanPrice(planKey, interval)}{interval === "yearly" ? "/year" : "/month"}:{" "}
            {PLANS[planKey].invoicesPerMonth.toLocaleString("en-US")} invoices/mo,{" "}
            {PLANS[planKey].sms.toLocaleString("en-US")} SMS included, then{" "}
            {smsOverageRateDisplay()}/SMS) — or switch plans anytime in Settings.
          </p>
          <p className="text-[11px] font-medium text-muted text-center mt-1.5">
            By creating your account you agree to our{" "}
            <a href="/terms" className="underline hover:text-ink" target="_blank">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline hover:text-ink" target="_blank">
              Privacy Policy
            </a>
            .
          </p>
        </form>
      </div>
    </div>
  );
}
