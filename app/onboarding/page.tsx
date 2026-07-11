import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBusiness } from "@/app/actions/business";

export default async function OnboardingPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // already has a business? straight to the app
  const { data: existing } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (existing) redirect("/invoices");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-surface py-10">
      <div className="text-2xl font-bold tracking-tight mb-8">
        Sorted
      </div>
      <div className="card w-full max-w-md p-7">
        <h1 className="text-xl font-bold">Set up your business</h1>
        <p className="text-ink-600 text-sm mt-1 mb-6">
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
            <p className="text-xs text-ink-400 mt-1.5">
              This is the name your customers see on reminders.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="country">
              Where do you work?
            </label>
            <select id="country" name="country" className="field" defaultValue="US">
              <option value="US">United States (USD)</option>
              <option value="UK">United Kingdom (GBP)</option>
              <option value="CA">Canada (CAD)</option>
              <option value="AU">Australia (AUD)</option>
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
              Your mobile <span className="text-ink-400 font-normal">(optional)</span>
            </label>
            <input id="phone" name="phone" type="tel" className="field" placeholder="+1 555 000 1234" />
          </div>
          <button type="submit" className="btn-primary w-full">
            Start chasing invoices →
          </button>
        </form>
      </div>
    </div>
  );
}
