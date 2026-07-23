/* Bulk-generates AppSumo LTD codes and inserts them as "unredeemed" into appsumo_codes.
 * Prints the generated codes (and writes them to a CSV) — that list is what you hand to
 * AppSumo, or use for your own manual distribution.
 *
 * Run: npx tsx scripts/generate-appsumo-codes.ts --tier 1 --count 100
 */
import { readFileSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
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

function argValue(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const tier = parseInt(argValue("tier", "1"), 10);
const count = parseInt(argValue("count", "10"), 10);
if (![1, 2, 3].includes(tier)) {
  console.error("--tier must be 1, 2, or 3");
  process.exit(1);
}
if (count < 1 || count > 5000) {
  console.error("--count must be between 1 and 5000");
  process.exit(1);
}

function randomCode(): string {
  const chunk = () => randomBytes(3).toString("hex").toUpperCase();
  return `PAYPIGEON-${chunk()}-${chunk()}`;
}

async function main() {
  const db = createClient(URL_, SECRET, { auth: { persistSession: false } });

  const codes = Array.from({ length: count }, () => ({ code: randomCode(), tier }));
  const { error } = await db.from("appsumo_codes").insert(codes);
  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }

  const csv = "code\n" + codes.map((c) => c.code).join("\n") + "\n";
  const filename = `appsumo-codes-tier${tier}-${Date.now()}.csv`;
  writeFileSync(filename, csv);

  console.log(`✅ Generated ${count} Tier ${tier} codes.`);
  console.log(`   Saved to ${filename}`);
}

main();
