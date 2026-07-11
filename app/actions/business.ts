"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase, requireBusiness } from "@/lib/supabase/server";
import { CURRENCY_FOR_COUNTRY, TIMEZONE_FOR_COUNTRY, isSupportedCurrency } from "@/lib/money";
import { defaultSteps } from "@/lib/templates";
import type { Tone } from "@/lib/types";

export async function createBusiness(formData: FormData) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") || "").trim();
  const country = String(formData.get("country") || "US");
  const phone = String(formData.get("phone") || "").trim() || null;
  const tone = (String(formData.get("tone") || "professional") as Tone);
  const chosenCurrency = String(formData.get("currency") || "");
  if (!name) redirect("/onboarding");

  const { data: business, error } = await supabase
    .from("businesses")
    .insert({
      owner_id: user.id,
      name,
      country,
      currency: isSupportedCurrency(chosenCurrency)
        ? chosenCurrency
        : (CURRENCY_FOR_COUNTRY[country] ?? "USD"),
      timezone: TIMEZONE_FOR_COUNTRY[country] ?? "America/New_York",
      tone,
      phone,
      reply_to_email: user.email,
      from_name: name,
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

  redirect("/invoices?welcome=1");
}

export async function updateBusiness(formData: FormData) {
  const { supabase, business } = await requireBusiness();

  const updates: Record<string, unknown> = {};
  for (const key of ["name", "from_name", "reply_to_email", "phone", "timezone"]) {
    const v = formData.get(key);
    if (v !== null) updates[key] = String(v).trim() || null;
  }
  if (!updates.name) delete updates.name;

  const currency = String(formData.get("currency") || "");
  if (isSupportedCurrency(currency)) updates.currency = currency;

  const quietStart = formData.get("quiet_start");
  const quietEnd = formData.get("quiet_end");
  // compliance floor/ceiling enforced in DB too: 8..20
  if (quietStart) updates.quiet_start = Math.max(8, parseInt(String(quietStart), 10) || 9);
  if (quietEnd) updates.quiet_end = Math.min(20, parseInt(String(quietEnd), 10) || 20);

  const { error } = await supabase.from("businesses").update(updates).eq("id", business.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function updateTone(formData: FormData) {
  const { supabase, business } = await requireBusiness();
  const tone = String(formData.get("tone")) as Tone;
  if (!["friendly", "professional", "firm"].includes(tone)) return { error: "Invalid tone" };

  await supabase.from("businesses").update({ tone }).eq("id", business.id);
  // re-seed the default sequence copy in the new tone
  await supabase
    .from("sequences")
    .update({ tone, steps: defaultSteps(tone) })
    .eq("business_id", business.id)
    .eq("is_default", true);
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
    .update({ steps })
    .eq("id", sequenceId);
  if (error) return { error: error.message };
  revalidatePath("/settings/templates");
  return { ok: true };
}
