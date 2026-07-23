import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * HIDDEN monthly cap on AI extraction attempts — an infrastructure cost guardrail, NOT a
 * plan feature. Never render these numbers anywhere user-facing (pricing, tooltips, API
 * responses): the only thing a user ever sees is the soft-fallback prompt steering them to
 * CSV import / manual entry, both of which stay unlimited and never touch this counter.
 *
 * This module is server-only (enforced by the "server-only" import) so the caps can't leak
 * into a client bundle. Counts ATTEMPTS (extraction_used events, logged before the Claude
 * call in /api/extract) per calendar month — a rejected or retried scan that never becomes
 * an invoice still spent real Anthropic money, so it still counts. Composes with the
 * existing 30/hour rate limit; whichever trips first wins.
 */
const AI_EXTRACTIONS_PER_MONTH: Record<string, number> = {
  solo: 50,
  crew: 150,
  pro: 500,
  trial: 150, // trial gets Crew-level limits, same convention as invoiceLimitFor
  free: 50,
  expired: 0,
  lifetime: 500, // flat Pro-level ceiling — pure cost guardrail, deliberately not tier-mapped
};

export function aiExtractionCapFor(plan: string): number {
  return AI_EXTRACTIONS_PER_MONTH[plan] ?? 50;
}

/** True when the business has used this calendar month's extraction attempts. */
export async function aiExtractionCapReached(
  db: SupabaseClient,
  business: { id: string; plan: string }
): Promise<boolean> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id)
    .eq("type", "extraction_used")
    .gte("created_at", monthStart.toISOString());
  return (count ?? 0) >= aiExtractionCapFor(business.plan);
}
