/* Revokes a redeemed AppSumo code — for AppSumo's 60-day refund window, since AppSumo
 * handles the actual refund on their end and just needs us to pull access on notice.
 * Demotes the business's lifetime_tier by 1; if that drops it to 0, the business plan
 * is set to "expired" (no more lifetime access). Does NOT touch any other stacked codes
 * the business may have redeemed — only marks the one code given as "refunded".
 *
 * Run: npx tsx scripts/revoke-appsumo-code.ts PAYPIGEON-ABC123-DEF456
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+[A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
if (!SECRET) {
  console.error("SUPABASE_SECRET_KEY not set in .env.local — required to write appsumo_codes.");
  process.exit(1);
}

const code = process.argv[2]?.trim().toUpperCase();
if (!code) {
  console.error("Usage: npx tsx scripts/revoke-appsumo-code.ts <CODE>");
  process.exit(1);
}

async function main() {
  const db = createClient(URL_, SECRET, { auth: { persistSession: false } });

  const { data: row } = await db.from("appsumo_codes").select("*").eq("code", code).maybeSingle();
  if (!row) {
    console.error(`No code found matching ${code}`);
    process.exit(1);
  }
  if (row.status !== "redeemed") {
    console.error(`Code ${code} is "${row.status}", not "redeemed" — nothing to revoke.`);
    process.exit(1);
  }

  await db.from("appsumo_codes").update({ status: "refunded" }).eq("id", row.id);

  if (row.redeemed_by_business_id) {
    const { data: business } = await db
      .from("businesses")
      .select("id, name, lifetime_tier")
      .eq("id", row.redeemed_by_business_id)
      .maybeSingle();
    if (business) {
      const newTier = Math.max(0, business.lifetime_tier - 1);
      await db
        .from("businesses")
        .update({ lifetime_tier: newTier, plan: newTier === 0 ? "expired" : "lifetime" })
        .eq("id", business.id);
      console.log(
        `✅ Revoked ${code}. "${business.name}" is now at lifetime_tier=${newTier}` +
          (newTier === 0 ? " (plan set to expired)." : ".")
      );
      return;
    }
  }
  console.log(`✅ Revoked ${code} (was not attached to an active business).`);
}

main();
