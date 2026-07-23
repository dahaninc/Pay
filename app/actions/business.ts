"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createServerSupabase, requireBusiness } from "@/lib/supabase/server";
import { TIMEZONE_FOR_COUNTRY, isSupportedCurrency } from "@/lib/money";
import { defaultSteps, type PresetTone } from "@/lib/templates";
import { PLANS } from "@/lib/plans";
import { cleanPhoneInput } from "@/lib/senders";
import type { Tone } from "@/lib/types";

export async function createBusiness(formData: FormData) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") || "").trim();
  const phone = cleanPhoneInput(formData.get("phone"));
  const rawTone = String(formData.get("tone") || "professional");
  // signup only ever offers the 3 written presets (see the <select> in app/onboarding/page.tsx)
  // — "custom" only becomes reachable later, from the templates editor
  const tone: PresetTone = (["friendly", "professional", "firm"] as const).includes(rawTone as PresetTone)
    ? (rawTone as PresetTone)
    : "professional";
  const chosenCurrency = String(formData.get("currency") || "");
  const rawPlan = String(formData.get("plan") || "");
  const plan = rawPlan in PLANS ? (rawPlan as keyof typeof PLANS) : "crew";
  const interval = formData.get("interval") === "yearly" ? "yearly" : "monthly";
  if (!name) redirect("/onboarding");

  const currency = isSupportedCurrency(chosenCurrency) ? chosenCurrency : "USD";
  // Onboarding no longer asks "where do you work?" — the country column (used only to seed
  // defaults) is derived from the chosen currency, and the timezone comes from the browser
  // (hidden field, see TimezoneField) which beats any country-based guess. Both editable later.
  const CURRENCY_TO_COUNTRY: Record<string, string> = { GBP: "UK", CAD: "CA", AUD: "AU" };
  const country = CURRENCY_TO_COUNTRY[currency] ?? "US";
  const rawTz = String(formData.get("tz") || "");
  let timezone = TIMEZONE_FOR_COUNTRY[country] ?? "America/New_York";
  if (rawTz) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: rawTz }); // throws on invalid tz
      timezone = rawTz;
    } catch {
      // keep the currency-derived fallback
    }
  }

  // first-touch attribution captured by middleware (see pp_attr cookie); also records which
  // plan/interval the user picked before this no-card signup, so the invoice-#3 upgrade wall
  // (components/InvoiceActions.tsx) can default Checkout to what they actually wanted.
  let signupSource: Record<string, string | null> = {};
  try {
    const attr = (await cookies()).get("pp_attr")?.value;
    if (attr) signupSource = JSON.parse(attr);
  } catch {
    // malformed cookie — record nothing rather than fail signup
  }
  signupSource.intended_plan = plan;
  signupSource.intended_interval = interval;

  const { data: business, error } = await supabase
    .from("businesses")
    .insert({
      owner_id: user.id,
      name,
      country,
      signup_source: signupSource,
      currency,
      timezone,
      tone,
      phone,
      reply_to_email: user.email,
      from_name: name,
      plan: "free",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("business_members").insert({
    business_id: business.id,
    user_id: user.id,
    role: "owner",
  });

  await supabase.from("sequences").insert({
    business_id: business.id,
    name: "Default sequence",
    tone,
    steps: defaultSteps(tone),
    is_default: true,
  });

  // No card at signup: businesses start on the no-card free tier (2 free invoices, email-only —
  // see lib/trial.ts isFreeTierInvoiceBlocked and the arm gates in app/actions/invoices.ts). A
  // card is only collected when they create a 3rd invoice, via the upgrade wall on that invoice's
  // page (components/InvoiceActions.tsx → startSubscription in app/actions/billing.ts).
  redirect("/invoices?welcome=1");
}

export async function updateBusiness(formData: FormData) {
  const { supabase, business } = await requireBusiness();

  const updates: Record<string, unknown> = {};
  for (const key of ["name", "from_name", "reply_to_email", "timezone"]) {
    const v = formData.get(key);
    if (v !== null) updates[key] = String(v).trim() || null;
  }
  if (!updates.name) delete updates.name;
  if (formData.get("phone") !== null) updates.phone = cleanPhoneInput(formData.get("phone"));

  const currency = String(formData.get("currency") || "");
  if (isSupportedCurrency(currency)) updates.currency = currency;

  const quietStart = formData.get("quiet_start");
  const quietEnd = formData.get("quiet_end");
  // compliance floor/ceiling enforced in DB too: 7am-10pm — the business picks the window
  // WITHIN that range (see components/QuietHoursEditor.tsx), never outside it. 8am-9pm is the
  // suggested standard (new signups default there) but every business can move within 7-22.
  if (quietStart) updates.quiet_start = Math.max(7, parseInt(String(quietStart), 10) || 8);
  if (quietEnd) updates.quiet_end = Math.min(22, parseInt(String(quietEnd), 10) || 21);
  if (
    typeof updates.quiet_start === "number" &&
    typeof updates.quiet_end === "number" &&
    updates.quiet_start >= updates.quiet_end
  ) {
    throw new Error("Quiet hours start must be earlier than the end time");
  }

  // the single local clock-time every reminder step aims for (see lib/scheduler.ts
  // stepSendTime) — clamped inside whatever quiet-hours window ends up in effect
  const sendHour = formData.get("preferred_send_hour");
  if (sendHour) {
    const effectiveStart = (updates.quiet_start as number | undefined) ?? business.quiet_start;
    const effectiveEnd = (updates.quiet_end as number | undefined) ?? business.quiet_end;
    const parsed = parseInt(String(sendHour), 10) || effectiveStart;
    updates.preferred_send_hour = Math.min(Math.max(parsed, effectiveStart), effectiveEnd - 1);
  }

  const allowSunday = formData.get("allow_sunday");
  if (allowSunday !== null) updates.allow_sunday = String(allowSunday) === "true";

  const { error } = await supabase.from("businesses").update(updates).eq("id", business.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function updateTone(formData: FormData) {
  const { supabase, business } = await requireBusiness();
  const tone = String(formData.get("tone")) as Tone;
  if (!["friendly", "professional", "firm", "custom"].includes(tone)) return { error: "Invalid tone" };

  await supabase.from("businesses").update({ tone }).eq("id", business.id);
  // "custom" means "this business wrote its own wording" — never reseed over it. Only the
  // three written presets replace the 5 messages with fresh copy in that tone.
  if (tone !== "custom") {
    await supabase
      .from("sequences")
      .update({ tone, steps: defaultSteps(tone) })
      .eq("business_id", business.id)
      .eq("is_default", true);
  } else {
    await supabase
      .from("sequences")
      .update({ tone })
      .eq("business_id", business.id)
      .eq("is_default", true);
  }
  revalidatePath("/settings/templates");
  return { ok: true };
}

export async function updateSequenceStep(formData: FormData) {
  const { supabase, business } = await requireBusiness();
  const sequenceId = String(formData.get("sequence_id"));
  const stepIndex = parseInt(String(formData.get("step_index")), 10);
  const subject = String(formData.get("subject") || "");
  const body = String(formData.get("body") || "");
  if (!body.trim()) return { error: "Message body cannot be empty" };

  const { data: seq } = await supabase
    .from("sequences")
    .select("steps")
    .eq("id", sequenceId)
    .eq("business_id", business.id)
    .single();
  if (!seq) return { error: "Sequence not found" };

  const steps = seq.steps as { subject?: string; body: string }[];
  if (!steps[stepIndex]) return { error: "Step not found" };
  steps[stepIndex].body = body;
  if (subject) steps[stepIndex].subject = subject;

  const { error } = await supabase
    .from("sequences")
    .update({ steps, tone: "custom" })
    .eq("id", sequenceId);
  if (error) return { error: error.message };
  // Hand-editing one message means the tone label can no longer honestly describe what's
  // being sent — flip the business to "custom" so Settings doesn't keep showing (say)
  // "Professional" once its wording has been personally rewritten. Only touches tone, never
  // the other 4 messages.
  await supabase.from("businesses").update({ tone: "custom" }).eq("id", business.id);
  revalidatePath("/settings/templates");
  revalidatePath("/settings");
  return { ok: true, tone: "custom" };
}
