"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { LTD_MAX_STACK, APPSUMO_ENABLED } from "@/lib/plans";

/**
 * Redeems one AppSumo LTD code onto the current business. Codes stack: each successful
 * redemption bumps lifetime_tier by 1, up to LTD_MAX_STACK. Validation and the redeem
 * itself both go through the service-role client since appsumo_codes has no public RLS
 * policy (deny-by-default) — a code's existence/status shouldn't be discoverable by
 * authenticated users poking at the table directly.
 */
export async function redeemAppsumoCode(formData: FormData) {
  // Server actions are network-callable regardless of UI — gate here too, not just the
  // hidden Settings box, so redemption is truly off until the AppSumo listing is live.
  if (!APPSUMO_ENABLED) return { error: "Code redemption isn't available yet" };

  const { business } = await requireBusiness();
  const raw = String(formData.get("code") || "").trim().toUpperCase();
  if (!raw) return { error: "Enter a code" };

  const admin = createAdminSupabase();
  if (!admin) return { error: "Redemption isn't available right now — try again shortly" };

  if (business.lifetime_tier >= LTD_MAX_STACK) {
    return { error: `You've already stacked the maximum of ${LTD_MAX_STACK} codes` };
  }

  const { data: code } = await admin
    .from("appsumo_codes")
    .select("*")
    .eq("code", raw)
    .maybeSingle();

  if (!code) return { error: "That code isn't recognized" };
  if (code.status !== "unredeemed") return { error: "That code has already been used" };

  const newTier = Math.min(business.lifetime_tier + 1, LTD_MAX_STACK);

  const { error: codeError } = await admin
    .from("appsumo_codes")
    .update({
      status: "redeemed",
      redeemed_by_business_id: business.id,
      redeemed_at: new Date().toISOString(),
    })
    .eq("id", code.id)
    .eq("status", "unredeemed"); // guards against a concurrent double-redeem race
  if (codeError) return { error: "Couldn't redeem that code — try again" };

  await admin
    .from("businesses")
    .update({ plan: "lifetime", lifetime_tier: newTier })
    .eq("id", business.id);

  await admin.from("events").insert({
    business_id: business.id,
    type: "appsumo_code_redeemed",
    data: { code: raw, tier: code.tier, new_lifetime_tier: newTier },
  });

  revalidatePath("/settings");
  return { ok: true, tier: newTier };
}
