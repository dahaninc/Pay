import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBusiness } from "@/app/actions/business";
import { Logo } from "@/components/Logo";
import { CURRENCIES } from "@/lib/money";

export default async function OnboardingPage() {
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="country">
                Where do you work?
              </label>
              <select id="country" name="country" className="field" defaultValue="US">
                <option value="US">United States</option>
                <option value="UK">United Kingdom</option>
                <option value="CA">Canada</option>
                <option value="AU">Australia</option>
              </select>
            </div>
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
            <input id="phone" name="phone" type="tel" className="field" placeholder="+1 555 000 1234" />
          </div>
          <button type="submit" className="btn-primary w-full !font-extrabold">
            Start chasing invoices →
          </button>
        </form>
      </div>
    </div>
  );
}
