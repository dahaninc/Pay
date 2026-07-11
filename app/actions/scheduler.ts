"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/supabase/server";
import { processDueReminders } from "@/lib/scheduler";

/** In-app "process due reminders" — RLS-scoped to this business. In production the cron does this. */
export async function runSchedulerNow() {
  const { supabase, business } = await requireBusiness();
  const outcomes = await processDueReminders(supabase, { businessId: business.id });
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  const sent = outcomes.filter((o) => o.action === "sent" || o.action === "simulated").length;
  return { ok: true, processed: outcomes.length, sent, outcomes };
}
